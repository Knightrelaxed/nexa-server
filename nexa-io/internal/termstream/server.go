// Package termstream implements the sandboxed inspection terminal worker
// for nexa-io --mode=terminal (FR-TERM-01..18, FR-AUTH-06/11, FR-SRV-02, PRD §10.4).
package termstream

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"nexa-io/internal/logstream"
	"nexa-io/internal/proto"
	"nexa-io/internal/ptyutil"
	"nexa-io/internal/ticket"
	"nexa-io/internal/ws"
)

const (
	DefaultDetachTimeout     = 30 * time.Second
	DefaultGraceTimeout      = 120 * time.Second
	DefaultMaxSessionAge     = 4 * time.Hour
	DefaultIdleTimeout       = 90 * time.Second
	DefaultMaxGlobalSessions = 2
	DefaultMaxConns          = 4
	preOpenReadDeadline      = 5 * time.Second
	maxTermRows              = 200
	maxTermCols              = 300
	// G-C1: Placed outside /etc/nexa (which is InaccessiblePaths in nexa-term.service)
	DefaultKillSwitchFile = "/opt/nexa/etc/terminal.enabled"
	stdinQueueCapacity    = 64
)

// PTYFactory spawns a PTY session (pluggable for unit tests).
type PTYFactory func(rows, cols uint16) (ptyutil.Session, error)

// Config configures the terminal WebSocket server.
type Config struct {
	Verifier          *ticket.Verifier
	PTYFactory        PTYFactory
	Enabled           bool   // Kill switch flag (FR-TERM-18: default false)
	EnableFlagFile    string // Optional file whose presence enables terminal
	DetachTimeout     time.Duration
	GraceTimeout      time.Duration
	MaxSessionAge     time.Duration
	IdleTimeout       time.Duration
	MaxGlobalSessions int
	MaxConns          int
	ShellPath         string
	HomeDir           string
	UserName          string
	OnIdleShutdown    func()
}

type termSession struct {
	sid       string
	deviceID  string
	pty       ptyutil.Session
	ring      *ReplayRing
	createdAt time.Time
	stdinCh   chan []byte
	stdinDone chan struct{}

	mu          sync.Mutex
	activeConn  *ws.Conn
	activeCh    uint8
	credit      int64
	creditCond  *sync.Cond
	detached    bool
	resuming    bool   // G-H5 / C2: pauses ptyReadLoop while RESUME replays missed bytes
	detachGen   uint64 // G-H6: guards graceTimer against killing a newly resumed session
	closed      bool
	graceTimer  *time.Timer
	maxAgeTimer *time.Timer
}

// Server handles /io/term binary WebSocket connections.
type Server struct {
	cfg           Config
	mu            sync.Mutex
	sessions      map[string]*termSession // sid -> *termSession
	pendingSpawns int                     // M3: reserves session slots while spawning PTY outside s.mu
	activeConns   int                     // H4/G-M2: includes pre-OPEN WS connections under s.mu
	shuttingDown  bool                    // H4: coordinated with idle watchdog before Verify()
	limiter       *logstream.IPRateLimiter
	lastActive    atomic.Int64
}

// NewServer creates a new Terminal Server (Kill Switch defaults to OFF, FR-TERM-18).
func NewServer(cfg Config) *Server {
	if cfg.DetachTimeout <= 0 {
		cfg.DetachTimeout = DefaultDetachTimeout
	}
	if cfg.GraceTimeout <= 0 {
		cfg.GraceTimeout = DefaultGraceTimeout
	}
	if cfg.MaxSessionAge <= 0 {
		cfg.MaxSessionAge = DefaultMaxSessionAge
	}
	if cfg.IdleTimeout <= 0 {
		cfg.IdleTimeout = DefaultIdleTimeout
	}
	if cfg.MaxGlobalSessions <= 0 {
		cfg.MaxGlobalSessions = DefaultMaxGlobalSessions
	}
	if cfg.MaxConns <= 0 {
		cfg.MaxConns = DefaultMaxConns
	}
	if cfg.EnableFlagFile == "" {
		cfg.EnableFlagFile = DefaultKillSwitchFile
	}

	s := &Server{
		cfg:      cfg,
		sessions: make(map[string]*termSession),
		limiter:  logstream.NewIPRateLimiter(30, 15, 256),
	}
	s.lastActive.Store(time.Now().UnixNano())
	if s.cfg.PTYFactory == nil {
		s.cfg.PTYFactory = func(rows, cols uint16) (ptyutil.Session, error) {
			return ptyutil.StartShell(s.cfg.ShellPath, s.cfg.HomeDir, s.cfg.UserName, rows, cols)
		}
	}
	return s
}

func clampTermSize(rows, cols uint16) (uint16, uint16) {
	if rows == 0 {
		rows = 24
	}
	if cols == 0 {
		cols = 80
	}
	if rows > maxTermRows {
		rows = maxTermRows
	}
	if cols > maxTermCols {
		cols = maxTermCols
	}
	return rows, cols
}

// IsEnabled checks the server-side kill switch (FR-TERM-18 / FR-SEC-07). Default is OFF.
func (s *Server) IsEnabled() bool {
	if s.cfg.Enabled {
		return true
	}
	for _, envKey := range []string{"NEXA_TERMINAL_ENABLED", "NEXA_TERM_ENABLED"} {
		val := strings.ToLower(strings.TrimSpace(os.Getenv(envKey)))
		if val == "1" || val == "true" || val == "yes" {
			return true
		}
	}
	if s.cfg.EnableFlagFile != "" {
		if _, err := os.Stat(s.cfg.EnableFlagFile); err == nil {
			return true
		}
	}
	return false
}

// ShutdownAll cleanly terminates all live/detached sessions with the given CLOSE reason (G-M2/H4).
func (s *Server) ShutdownAll(reason uint8) {
	s.mu.Lock()
	if reason == proto.CloseServerStop {
		s.shuttingDown = true
	}
	all := make([]*termSession, 0, len(s.sessions))
	for _, sess := range s.sessions {
		all = append(all, sess)
	}
	s.mu.Unlock()

	for _, sess := range all {
		s.terminateSession(sess, reason)
	}
}

// ServeHTTP enforces the kill switch, verifies Ed25519 ticket (scope=term, sid required),
// and upgrades to a binary WebSocket.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clientIP := logstream.ExtractClientIP(r)
	safeIP := logstream.SanitizeLogField(clientIP)

	// G-L1: Fail closed if Verifier is not configured
	if s.cfg.Verifier == nil {
		http.Error(w, "ticket verifier not configured", http.StatusInternalServerError)
		return
	}

	// H4 / H6: Check shuttingDown, rate limit, and activeConns BEFORE Verify() so idle exit never burns a JTI
	s.mu.Lock()
	if s.shuttingDown {
		s.mu.Unlock()
		http.Error(w, "terminal worker shutting down; retry to wake worker", http.StatusServiceUnavailable)
		return
	}
	if !s.limiter.Allow(clientIP) {
		s.mu.Unlock()
		fmt.Fprintf(os.Stderr, "[NEXA-TERM] auth_reject ip=%s reason=rate_limited\n", safeIP)
		http.Error(w, "too many handshake attempts", http.StatusTooManyRequests)
		return
	}
	if s.activeConns >= s.cfg.MaxConns {
		s.mu.Unlock()
		fmt.Fprintf(os.Stderr, "[NEXA-TERM] auth_reject ip=%s reason=max_conns_reached\n", safeIP)
		http.Error(w, "too many active terminal connections", http.StatusTooManyRequests)
		return
	}
	s.activeConns++
	s.lastActive.Store(time.Now().UnixNano())
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.activeConns--
		s.lastActive.Store(time.Now().UnixNano())
		s.mu.Unlock()
	}()

	// FR-TERM-18 / FR-SEC-07: Server-side kill switch (default OFF)
	if !s.IsEnabled() {
		fmt.Fprintf(os.Stderr, "[NEXA-TERM] auth_reject ip=%s reason=kill_switch_off\n", safeIP)
		http.Error(w, "Terminal dinonaktifkan di server (kill switch OFF)", http.StatusForbidden)
		return
	}

	// FR-SEC-01: Forbid ticket in query string
	if r.URL.Query().Get("ticket") != "" || r.URL.Query().Get("token") != "" {
		fmt.Fprintf(os.Stderr, "[NEXA-TERM] auth_reject ip=%s reason=query_ticket_forbidden\n", safeIP)
		http.Error(w, "ticket in query string forbidden (FR-SEC-01)", http.StatusUnauthorized)
		return
	}

	token := logstream.ExtractBearerToken(r)
	if token == "" {
		fmt.Fprintf(os.Stderr, "[NEXA-TERM] auth_reject ip=%s reason=missing_bearer\n", safeIP)
		http.Error(w, "missing Authorization Bearer ticket", http.StatusUnauthorized)
		return
	}

	claims, err := s.cfg.Verifier.Verify(token, "term")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[NEXA-TERM] auth_reject ip=%s reason=%v\n", safeIP, err)
		http.Error(w, "invalid or expired terminal ticket: "+err.Error(), http.StatusUnauthorized)
		return
	}

	if strings.TrimSpace(claims.SID) == "" {
		http.Error(w, "terminal ticket missing sid claim (FR-TERM-17)", http.StatusUnauthorized)
		return
	}

	conn, err := ws.UpgradeHTTP(w, r)
	if err != nil {
		return
	}

	s.handleConnection(conn, claims, safeIP)
}

// StartIdleWatchdog exits cleanly after 90s with 0 active/detached sessions and 0 open WS connections (FR-SRV-02 / G-M2),
// and enforces live kill-switch revocation every 1s (H7).
func (s *Server) StartIdleWatchdog(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// H7: Immediately terminate live sessions if server-side kill switch is flipped OFF mid-session
			if !s.IsEnabled() {
				s.mu.Lock()
				hasSessions := len(s.sessions) > 0
				s.mu.Unlock()
				if hasSessions {
					fmt.Fprintf(os.Stderr, "[NEXA-TERM] kill_switch_flipped_off: terminating all live sessions\n")
					s.ShutdownAll(proto.CloseAuth)
				}
			}

			s.mu.Lock()
			if s.shuttingDown {
				s.mu.Unlock()
				return
			}
			count := len(s.sessions) + s.pendingSpawns
			conns := s.activeConns
			if count > 0 || conns > 0 {
				s.lastActive.Store(time.Now().UnixNano())
				s.mu.Unlock()
				continue
			}
			idleDur := time.Duration(time.Now().UnixNano() - s.lastActive.Load())
			if idleDur >= s.cfg.IdleTimeout {
				// H4: Atomically mark shuttingDown under s.mu before calling shutdown callback
				s.shuttingDown = true
				s.mu.Unlock()
				if s.cfg.OnIdleShutdown != nil {
					s.cfg.OnIdleShutdown()
				}
				return
			}
			s.mu.Unlock()
		}
	}
}

func (s *Server) handleConnection(conn *ws.Conn, claims *ticket.Claims, safeIP string) {
	defer conn.Close()

	var currentSession *termSession
	var termChannel uint8 = proto.ChTermMin

	defer func() {
		if currentSession != nil {
			s.detachSession(currentSession, conn)
		}
	}()

	for {
		// H6 / FR-TERM-12: Tight 5s pre-OPEN/RESUME deadline, then 30s Dead-Man Switch read deadline
		deadline := s.cfg.DetachTimeout
		if currentSession == nil && preOpenReadDeadline < deadline {
			deadline = preOpenReadDeadline
		}
		_ = conn.SetReadDeadline(time.Now().Add(deadline))
		raw, err := conn.ReadBinaryFrame()
		if err != nil {
			return
		}

		ch, op, payload, err := proto.DecodeFrame(raw)
		if err != nil {
			_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(proto.ChControl, proto.ErrInvalidFrame, err.Error()))
			_ = conn.WriteCloseFrame(1002, "invalid frame")
			return
		}

		switch {
		case ch == proto.ChControl && op == proto.OpPing:
			pong, _ := proto.EncodeFrame(proto.ChControl, proto.OpPong, nil)
			_ = conn.WriteBinaryFrame(pong)

		case ch >= proto.ChTermMin && op == proto.OpOpen:
			openParams, err := proto.DecodeTermOpen(payload)
			if err != nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrInvalidFrame, "invalid terminal OPEN payload"))
				_ = conn.WriteCloseFrame(1002, "invalid OPEN")
				return
			}
			// G-M5: If client included a 16-byte SID in OPEN, it must match the verified ticket SID
			if openParams.HasSID && openParams.SID != sidTo16Bytes(claims.SID) {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrUnauthorized, "OPEN sid does not match ticket sid"))
				_ = conn.WriteCloseFrame(1008, "sid mismatch")
				return
			}
			rows, cols := clampTermSize(openParams.Rows, openParams.Cols)
			termChannel = ch
			sess, errCode, errMsg := s.openOrAttachSession(claims, safeIP, conn, ch, rows, cols)
			if sess == nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, errCode, errMsg))
				_ = conn.WriteCloseFrame(1008, errMsg)
				return
			}
			currentSession = sess

		case ch >= proto.ChTermMin && op == proto.OpResume:
			resumeParams, err := proto.DecodeTermResume(payload)
			if err != nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrInvalidFrame, "invalid terminal RESUME payload"))
				_ = conn.WriteCloseFrame(1002, "invalid RESUME")
				return
			}
			termChannel = ch
			sess, errCode, errMsg := s.resumeSession(claims, safeIP, conn, ch, resumeParams)
			if sess == nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, errCode, errMsg))
				_ = conn.WriteCloseFrame(1008, errMsg)
				return
			}
			currentSession = sess

		case ch == termChannel && op == proto.OpData:
			if currentSession == nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrInvalidFrame, "DATA received before OPEN/RESUME"))
				_ = conn.WriteCloseFrame(1002, "no active session")
				return
			}
			if len(payload) > 0 {
				// G-H9: Non-blocking enqueue to dedicated PTY writer so full kernel PTY buffer never stalls PING/Dead-Man Switch
				cp := make([]byte, len(payload))
				copy(cp, payload)
				select {
				case currentSession.stdinCh <- cp:
				default:
					// Queue saturated; drop excess stdin chunk instead of freezing control plane
				}
			}

		case ch == termChannel && op == proto.OpResize:
			rows, cols, err := proto.DecodeTermResize(payload)
			if err != nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrInvalidFrame, "invalid RESIZE payload"))
				_ = conn.WriteCloseFrame(1002, "invalid RESIZE")
				return
			}
			if currentSession != nil {
				cRows, cCols := clampTermSize(rows, cols)
				_ = currentSession.pty.Resize(cRows, cCols)
			}

		case ch == termChannel && op == proto.OpCredit:
			addBytes, err := proto.DecodeCredit(payload)
			if err != nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrInvalidFrame, "invalid CREDIT payload"))
				_ = conn.WriteCloseFrame(1002, "invalid CREDIT")
				return
			}
			if currentSession != nil {
				currentSession.mu.Lock()
				if addBytes == 0 {
					// Screen off / pause (FR-TERM-13): hold PTY read without killing session
					currentSession.credit = 0
				} else {
					currentSession.credit += int64(addBytes)
					if currentSession.credit > 256*1024 {
						currentSession.credit = 256 * 1024
					}
					currentSession.creditCond.Broadcast()
				}
				currentSession.mu.Unlock()
			}

		case (ch == termChannel || ch == proto.ChControl) && op == proto.OpClose:
			if currentSession != nil {
				s.terminateSession(currentSession, proto.CloseClientExit)
				currentSession = nil
			} else {
				_ = conn.WriteCloseFrame(1000, "")
			}
			return

		default:
			// M2: Reject unknown opcodes/channels explicitly
			_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(proto.ChControl, proto.ErrInvalidFrame, fmt.Sprintf("unsupported frame ch=0x%02x op=0x%02x", ch, op)))
			_ = conn.WriteCloseFrame(1002, "unsupported frame")
			return
		}
	}
}

func (s *Server) openOrAttachSession(claims *ticket.Claims, safeIP string, conn *ws.Conn, ch uint8, rows, cols uint16) (*termSession, uint8, string) {
	var oldConn *ws.Conn

	s.mu.Lock()
	if existing, ok := s.sessions[claims.SID]; ok {
		if existing.deviceID != claims.Dev {
			s.mu.Unlock()
			return nil, proto.ErrUnauthorized, "session sid belongs to another device"
		}
		existing.mu.Lock()
		if existing.closed {
			existing.mu.Unlock()
			delete(s.sessions, claims.SID)
		} else {
			if existing.graceTimer != nil {
				existing.graceTimer.Stop()
				existing.graceTimer = nil
			}
			oldConn = existing.activeConn
			existing.activeConn = conn
			existing.activeCh = ch
			existing.detached = false
			existing.resuming = false
			existing.detachGen++
			existing.credit = proto.InitialTermCredit
			existing.creditCond.Broadcast()
			existing.mu.Unlock()
			s.mu.Unlock()

			// G-H7: Close oldConn AFTER releasing s.mu; G-M5: resize PTY to new dimensions
			if oldConn != nil && oldConn != conn {
				_ = oldConn.Close()
			}
			_ = existing.pty.Resize(rows, cols)
			return existing, 0, ""
		}
	}

	// FR-AUTH-11 / M3: Global concurrent session cap (accounting for in-flight spawns), then release s.mu before PTYFactory
	if len(s.sessions)+s.pendingSpawns >= s.cfg.MaxGlobalSessions {
		s.mu.Unlock()
		return nil, proto.ErrResourceLimit, "batas sesi terminal bersamaan tercapai"
	}
	s.pendingSpawns++
	s.mu.Unlock()

	ptySess, err := s.cfg.PTYFactory(rows, cols)
	if err != nil {
		s.mu.Lock()
		s.pendingSpawns--
		s.mu.Unlock()
		return nil, proto.ErrResourceLimit, "gagal memulai PTY bash: " + err.Error()
	}

	sess := &termSession{
		sid:        claims.SID,
		deviceID:   claims.Dev,
		pty:        ptySess,
		ring:       NewReplayRing(proto.TermReplayRingBytes),
		createdAt:  time.Now(),
		stdinCh:    make(chan []byte, stdinQueueCapacity),
		stdinDone:  make(chan struct{}),
		activeConn: conn,
		activeCh:   ch,
		credit:     proto.InitialTermCredit,
	}
	sess.creditCond = sync.NewCond(&sess.mu)

	s.mu.Lock()
	s.pendingSpawns--
	if s.shuttingDown || !s.IsEnabled() {
		s.mu.Unlock()
		_ = ptySess.KillGroup()
		return nil, proto.ErrFeatureOff, "terminal ditutup saat inisialisasi"
	}
	if _, dup := s.sessions[claims.SID]; dup {
		s.mu.Unlock()
		_ = ptySess.KillGroup()
		return nil, proto.ErrResourceLimit, "sesi duplikat terdeteksi"
	}
	// FR-TERM-14: 4-hour absolute session limit
	sess.maxAgeTimer = time.AfterFunc(s.cfg.MaxSessionAge, func() {
		s.terminateSession(sess, proto.CloseSessionLimit)
	})
	s.sessions[claims.SID] = sess
	s.mu.Unlock()

	fmt.Fprintf(os.Stderr, "[NEXA-TERM] session_start ip=%s sid=%s dev=%s jti=%s rows=%d cols=%d\n",
		safeIP, logstream.SanitizeLogField(claims.SID), logstream.SanitizeLogField(claims.Dev), logstream.SanitizeLogField(claims.JTI), rows, cols)

	go s.ptyWriteLoop(sess)
	go s.ptyReadLoop(sess)
	return sess, 0, ""
}

func (s *Server) resumeSession(claims *ticket.Claims, safeIP string, conn *ws.Conn, ch uint8, params proto.TermResumeParams) (*termSession, uint8, string) {
	// Verify that the 16-byte SID in RESUME matches the verified Ed25519 ticket SID
	expectedSIDBytes := sidTo16Bytes(claims.SID)
	if params.SID != expectedSIDBytes {
		return nil, proto.ErrUnauthorized, "RESUME sid does not match ticket sid"
	}

	s.mu.Lock()
	sess, ok := s.sessions[claims.SID]
	s.mu.Unlock()
	if !ok {
		return nil, proto.ErrResumeFailed, "sesi terminal sudah berakhir atau tidak ditemukan"
	}

	sess.mu.Lock()
	if sess.closed {
		sess.mu.Unlock()
		return nil, proto.ErrResumeFailed, "sesi terminal sudah ditutup"
	}
	if sess.deviceID != claims.Dev {
		sess.mu.Unlock()
		return nil, proto.ErrUnauthorized, "device mismatch on terminal resume"
	}

	if sess.graceTimer != nil {
		sess.graceTimer.Stop()
		sess.graceTimer = nil
	}
	oldConn := sess.activeConn
	sess.activeConn = conn
	sess.activeCh = ch
	sess.detached = false
	sess.resuming = true // G-H5 / C2: hold ptyReadLoop live writes until replay + drain finish
	sess.detachGen++
	sess.credit = proto.InitialTermCredit

	// FR-TERM-11 / PRD §10.4: Snapshot replay bytes under sess.mu
	missed, inRing := sess.ring.SliceFrom(params.ReceivedOffset)
	currentSentOffset := sess.ring.SentOffset()
	sess.mu.Unlock()

	if oldConn != nil && oldConn != conn {
		_ = oldConn.Close()
	}

	var replayedBytes int64
	var writeErr error
	sentUpTo := currentSentOffset

	if inRing {
		if len(missed) > 0 {
			writeErr = s.writeChunkedData(conn, ch, missed)
			if writeErr == nil {
				replayedBytes += int64(len(missed))
			}
		}
	} else {
		// C1: Notify client of exact authoritative server sentOffset via ERR(7) OFFSET_RESET:<offset>
		// WITHOUT injecting an un-ringed "\x1b[2J\x1b[H" frame (which caused a permanent +7 offset desync!).
		// Client resets its terminal emulator on OFFSET_RESET, and SIGWINCH prompts shell redraw cleanly via ring.
		writeErr = conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrResumeFailed, fmt.Sprintf("OFFSET_RESET:%d", currentSentOffset)))
		if writeErr == nil {
			_ = sess.pty.SignalWinch()
		}
	}

	if writeErr != nil {
		sess.mu.Lock()
		if sess.activeConn == conn {
			sess.resuming = false
			sess.creditCond.Broadcast()
		}
		sess.mu.Unlock()
		s.detachSession(sess, conn)
		return nil, proto.ErrResumeFailed, "gagal mengirim replay terminal"
	}

	// C2: Drain any live PTY bytes appended to sess.ring while resuming == true before handing back to ptyReadLoop
	for {
		sess.mu.Lock()
		if sess.closed || sess.activeConn != conn {
			sess.mu.Unlock()
			return nil, proto.ErrResumeFailed, "sesi terminal diambil alih atau ditutup"
		}
		latestOffset := sess.ring.SentOffset()
		if latestOffset <= sentUpTo {
			sess.resuming = false
			if replayedBytes > 0 {
				sess.credit -= replayedBytes
				if sess.credit < 0 {
					sess.credit = 0
				}
			}
			sess.creditCond.Broadcast()
			sess.mu.Unlock()
			break
		}
		tail, tailInRing := sess.ring.SliceFrom(sentUpTo)
		sentUpTo = latestOffset
		sess.mu.Unlock()

		if tailInRing && len(tail) > 0 {
			if err := s.writeChunkedData(conn, ch, tail); err != nil {
				sess.mu.Lock()
				if sess.activeConn == conn {
					sess.resuming = false
					sess.creditCond.Broadcast()
				}
				sess.mu.Unlock()
				s.detachSession(sess, conn)
				return nil, proto.ErrResumeFailed, "koneksi terputus saat sinkronisasi replay"
			}
			replayedBytes += int64(len(tail))
		} else if !tailInRing {
			if err := conn.WriteBinaryFrame(proto.EncodeErrFrame(ch, proto.ErrResumeFailed, fmt.Sprintf("OFFSET_RESET:%d", sentUpTo))); err != nil {
				sess.mu.Lock()
				if sess.activeConn == conn {
					sess.resuming = false
					sess.creditCond.Broadcast()
				}
				sess.mu.Unlock()
				s.detachSession(sess, conn)
				return nil, proto.ErrResumeFailed, "koneksi terputus saat reset offset"
			}
			_ = sess.pty.SignalWinch()
		}
	}

	fmt.Fprintf(os.Stderr, "[NEXA-TERM] session_resume ip=%s sid=%s dev=%s jti=%s offset=%d server_offset=%d in_ring=%v replay_bytes=%d\n",
		safeIP, logstream.SanitizeLogField(claims.SID), logstream.SanitizeLogField(claims.Dev), logstream.SanitizeLogField(claims.JTI),
		params.ReceivedOffset, sentUpTo, inRing, replayedBytes)
	return sess, 0, ""
}

func (s *Server) detachSession(sess *termSession, closedConn *ws.Conn) {
	sess.mu.Lock()
	defer sess.mu.Unlock()

	if sess.closed || sess.activeConn != closedConn {
		return
	}

	sess.activeConn = nil
	sess.detached = true
	sess.resuming = false
	sess.detachGen++
	myGen := sess.detachGen
	sess.creditCond.Broadcast()

	// FR-TERM-12: 120-second grace timer after detach; guarded by detachGen (G-H6)
	if sess.graceTimer != nil {
		sess.graceTimer.Stop()
	}
	sess.graceTimer = time.AfterFunc(s.cfg.GraceTimeout, func() {
		s.terminateSessionIfDetached(sess, myGen, proto.CloseDetachExpired)
	})
	fmt.Fprintf(os.Stderr, "[NEXA-TERM] session_detached sid=%s gen=%d grace_sec=%.0f\n",
		logstream.SanitizeLogField(sess.sid), myGen, s.cfg.GraceTimeout.Seconds())
}

// terminateSessionIfDetached ensures a stale graceTimer callback can never kill a session
// that has already been resumed by a newer connection (G-H6).
func (s *Server) terminateSessionIfDetached(sess *termSession, expectedGen uint64, reason uint8) {
	sess.mu.Lock()
	if sess.closed || !sess.detached || sess.detachGen != expectedGen {
		sess.mu.Unlock()
		return
	}
	sess.mu.Unlock()
	s.terminateSession(sess, reason)
}

func (s *Server) terminateSession(sess *termSession, reason uint8) {
	sess.mu.Lock()
	if sess.closed {
		sess.mu.Unlock()
		return
	}
	sess.closed = true
	close(sess.stdinDone)
	if sess.graceTimer != nil {
		sess.graceTimer.Stop()
		sess.graceTimer = nil
	}
	if sess.maxAgeTimer != nil {
		sess.maxAgeTimer.Stop()
		sess.maxAgeTimer = nil
	}
	conn := sess.activeConn
	ch := sess.activeCh
	sess.activeConn = nil
	sess.creditCond.Broadcast()
	sess.mu.Unlock()

	s.mu.Lock()
	delete(s.sessions, sess.sid)
	s.mu.Unlock()

	if conn != nil {
		_ = conn.WriteBinaryFrame(proto.EncodeCloseFrame(ch, reason))
		_ = conn.WriteCloseFrame(1000, "")
		_ = conn.Close()
	}
	_ = sess.pty.KillGroup()
	fmt.Fprintf(os.Stderr, "[NEXA-TERM] session_end sid=%s reason=%d duration_sec=%.0f\n",
		logstream.SanitizeLogField(sess.sid), reason, time.Since(sess.createdAt).Seconds())
}

func (s *Server) ptyWriteLoop(sess *termSession) {
	for {
		select {
		case <-sess.stdinDone:
			return
		case data := <-sess.stdinCh:
			if len(data) == 0 {
				continue
			}
			if _, err := sess.pty.Write(data); err != nil {
				return
			}
		}
	}
}

func (s *Server) ptyReadLoop(sess *termSession) {
	buf := make([]byte, proto.MaxFramePayloadBytes)
	for {
		// FR-TERM-10 / FR-TERM-12 / FR-TERM-13 / G-H5: Block PTY read whenever credit == 0, detached, or resuming
		sess.mu.Lock()
		for !sess.closed && (sess.detached || sess.resuming || sess.activeConn == nil || sess.credit <= 0) {
			sess.creditCond.Wait()
		}
		if sess.closed {
			sess.mu.Unlock()
			return
		}
		maxRead := len(buf)
		if sess.credit < int64(maxRead) {
			maxRead = int(sess.credit)
		}
		sess.mu.Unlock()

		n, err := sess.pty.Read(buf[:maxRead])
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])

			// G-H5 / C2 / M3: Re-check activeConn/resuming/credit AFTER pty.Read() returns.
			// If screen turned off (credit == 0) mid-read, wait on creditCond so zero bytes are lost
			// and zero bytes are written to a paused screen.
			sess.mu.Lock()
			sess.ring.Append(chunk)
			for !sess.closed && !sess.detached && !sess.resuming && sess.activeConn != nil && sess.credit <= 0 {
				sess.creditCond.Wait()
			}
			if sess.closed || sess.detached || sess.resuming || sess.activeConn == nil {
				sess.mu.Unlock()
			} else {
				curConn := sess.activeConn
				curCh := sess.activeCh
				sess.mu.Unlock()

				frame, encErr := proto.EncodeFrame(curCh, proto.OpData, chunk)
				if encErr == nil {
					if writeErr := curConn.WriteBinaryFrame(frame); writeErr != nil {
						s.detachSession(sess, curConn)
						continue
					}
					sess.mu.Lock()
					if sess.activeConn == curConn {
						sess.credit -= int64(n)
						if sess.credit < 0 {
							sess.credit = 0
						}
					}
					sess.mu.Unlock()
				}
			}
		}
		if err != nil {
			// G-L3: Linux PTY master returns EIO when the slave login shell exits normally
			if !errors.Is(err, io.EOF) && !errors.Is(err, syscall.EIO) {
				fmt.Fprintf(os.Stderr, "[NEXA-TERM] pty read error sid=%s: %v\n", logstream.SanitizeLogField(sess.sid), err)
			}
			s.terminateSession(sess, proto.CloseNormal)
			return
		}
	}
}

func (s *Server) writeChunkedData(conn *ws.Conn, ch uint8, data []byte) error {
	for offset := 0; offset < len(data); offset += proto.MaxFramePayloadBytes {
		end := offset + proto.MaxFramePayloadBytes
		if end > len(data) {
			end = len(data)
		}
		frame, err := proto.EncodeFrame(ch, proto.OpData, data[offset:end])
		if err != nil {
			return err
		}
		if err := conn.WriteBinaryFrame(frame); err != nil {
			return err
		}
	}
	return nil
}

// sidTo16Bytes converts a base64url 16-byte SID string (or arbitrary SID) deterministically to 16 bytes.
func sidTo16Bytes(sid string) [16]byte {
	var out [16]byte
	if decoded, err := base64.RawURLEncoding.DecodeString(sid); err == nil && len(decoded) == 16 {
		copy(out[:], decoded)
		return out
	}
	sum := sha256.Sum256([]byte(sid))
	copy(out[:], sum[:16])
	return out
}
