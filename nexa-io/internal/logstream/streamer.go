// Package logstream implements the on-demand binary log streaming worker
// for nexa-io --mode=logs (FR-LOG-01..10, FR-LOG-13, FR-SRV-02, FR-SEC-01).
package logstream

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"nexa-io/internal/proto"
	"nexa-io/internal/ticket"
	"nexa-io/internal/ws"
)

const (
	DefaultBatchInterval = 150 * time.Millisecond
	MaxLinesPerBatch     = 30  // 30 lines per 150ms = 200 lines/sec (FR-LOG-07)
	MaxRingQueueRecords  = 512 // Safely holds max requested TailLines (500) before spike eviction
	DefaultPauseTimeout  = 5 * time.Minute
	DefaultIdleTimeout   = 90 * time.Second
	DefaultReadDeadline  = 45 * time.Second
	DefaultMaxConns      = 4
	DefaultPM2OutPath    = "/var/log/nexa/out.log"
	DefaultPM2ErrPath    = "/var/log/nexa/err.log"
	maxJournalLineBytes  = 256 * 1024
	maxPM2LineBytes      = 64 * 1024
)

// IPRateLimiter provides a bounded per-IP token bucket for WebSocket upgrade handshakes (H6).
type IPRateLimiter struct {
	mu           sync.Mutex
	buckets      map[string]*ipBucket
	refillPerSec float64
	burst        float64
	maxBuckets   int
}

type ipBucket struct {
	tokens   float64
	lastSeen time.Time
}

// NewIPRateLimiter constructs a bounded token-bucket limiter.
func NewIPRateLimiter(perMinute float64, burst float64, maxBuckets int) *IPRateLimiter {
	if perMinute <= 0 {
		perMinute = 30
	}
	if burst <= 0 {
		burst = 15
	}
	if maxBuckets <= 0 {
		maxBuckets = 256
	}
	return &IPRateLimiter{
		buckets:      make(map[string]*ipBucket),
		refillPerSec: perMinute / 60.0,
		burst:        burst,
		maxBuckets:   maxBuckets,
	}
}

// Allow checks and consumes 1 token for ip.
func (l *IPRateLimiter) Allow(ip string) bool {
	if l == nil {
		return true
	}
	key := ip
	if key == "" {
		key = "unknown"
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.buckets) >= l.maxBuckets {
		if _, exists := l.buckets[key]; !exists {
			// Sweep idle entries first
			for k, b := range l.buckets {
				if now.Sub(b.lastSeen) > 5*time.Minute {
					delete(l.buckets, k)
				}
			}
			// If still full, evict oldest entry
			if len(l.buckets) >= l.maxBuckets {
				var oldestKey string
				var oldestTime time.Time
				for k, b := range l.buckets {
					if oldestKey == "" || b.lastSeen.Before(oldestTime) {
						oldestKey = k
						oldestTime = b.lastSeen
					}
				}
				if oldestKey != "" {
					delete(l.buckets, oldestKey)
				}
			}
		}
	}

	b, ok := l.buckets[key]
	if !ok {
		b = &ipBucket{tokens: l.burst, lastSeen: now}
		l.buckets[key] = b
	} else {
		elapsed := now.Sub(b.lastSeen).Seconds()
		if elapsed > 0 {
			b.tokens += elapsed * l.refillPerSec
			if b.tokens > l.burst {
				b.tokens = l.burst
			}
		}
		b.lastSeen = now
	}

	if b.tokens < 1.0 {
		return false
	}
	b.tokens -= 1.0
	return true
}

// SanitizeLogField strips newlines/control chars/delimiters from audit log tokens.
func SanitizeLogField(s string) string {
	var sb strings.Builder
	sb.Grow(len(s))
	for _, r := range s {
		if sb.Len() >= 64 {
			break
		}
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '.' || r == '-' || r == '_' || r == ':' {
			sb.WriteRune(r)
		} else if r == ' ' || r == '\t' || r == '\r' || r == '\n' {
			sb.WriteByte('_')
		}
	}
	out := strings.Trim(sb.String(), "_")
	if out == "" {
		return "-"
	}
	return out
}

// SourceProducer is a pluggable log record producer (defaults to journalctl + optional PM2 log tail).
type SourceProducer func(ctx context.Context, params proto.LogOpenParams, out chan<- proto.LogRecord) error

// Config configures the log streaming HTTP/WebSocket server.
type Config struct {
	Verifier       *ticket.Verifier
	Producer       SourceProducer
	BatchInterval  time.Duration
	PauseTimeout   time.Duration
	IdleTimeout    time.Duration
	ReadDeadline   time.Duration
	MaxConns       int
	PM2OutLogPath  string
	PM2ErrLogPath  string
	OnIdleShutdown func()
}

type logSessionHandle struct {
	conn   *ws.Conn
	cancel context.CancelFunc
}

// Server handles /io/logs WebSocket connections and enforces idle exit.
type Server struct {
	cfg          Config
	lifecycleMu  sync.Mutex
	shuttingDown bool
	activeConns  int
	nextSessID   uint64
	sessions     map[uint64]logSessionHandle
	sessionWG    sync.WaitGroup
	limiter      *IPRateLimiter
	lastActive   atomic.Int64
}

// NewServer creates a new Log Streamer Server.
func NewServer(cfg Config) *Server {
	if cfg.BatchInterval <= 0 {
		cfg.BatchInterval = DefaultBatchInterval
	}
	if cfg.PauseTimeout <= 0 {
		cfg.PauseTimeout = DefaultPauseTimeout
	}
	if cfg.IdleTimeout <= 0 {
		cfg.IdleTimeout = DefaultIdleTimeout
	}
	if cfg.ReadDeadline <= 0 {
		cfg.ReadDeadline = DefaultReadDeadline
	}
	if cfg.MaxConns <= 0 {
		cfg.MaxConns = DefaultMaxConns
	}
	s := &Server{
		cfg:      cfg,
		sessions: make(map[uint64]logSessionHandle),
		limiter:  NewIPRateLimiter(30, 15, 256),
	}
	s.lastActive.Store(time.Now().UnixNano())
	if s.cfg.Producer == nil {
		s.cfg.Producer = s.defaultJournalAndPM2Producer
	}
	return s
}

// ExtractBearerToken extracts the token from "Authorization: Bearer <ticket>" (FR-SEC-01).
func ExtractBearerToken(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(auth) < 8 || !strings.EqualFold(auth[:7], "Bearer ") {
		return ""
	}
	return strings.TrimSpace(auth[7:])
}

// ExtractClientIP extracts the validated client IP from the rightmost X-Forwarded-For entry
// ONLY when received over a trusted local proxy (Unix domain socket or loopback), otherwise
// falls back to RemoteAddr (M4). Always validated via netip.ParseAddr.
func ExtractClientIP(r *http.Request) string {
	remoteRaw := strings.TrimSpace(r.RemoteAddr)
	trustedProxy := false
	var remoteAddr netip.Addr
	hasRemoteAddr := false

	if remoteRaw == "" || remoteRaw == "@" || strings.HasPrefix(remoteRaw, "/") {
		// systemd Unix socket / Caddy reverse_proxy unix//run/...
		trustedProxy = true
	} else {
		host := remoteRaw
		if h, _, err := net.SplitHostPort(remoteRaw); err == nil {
			host = h
		}
		if addr, err := netip.ParseAddr(strings.Trim(host, "[]")); err == nil {
			remoteAddr = addr.Unmap()
			hasRemoteAddr = true
			if remoteAddr.IsLoopback() {
				trustedProxy = true
			}
		}
	}

	if trustedProxy {
		if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
			parts := strings.Split(xff, ",")
			for i := len(parts) - 1; i >= 0; i-- {
				cand := strings.TrimSpace(parts[i])
				if addr, err := netip.ParseAddr(strings.Trim(cand, "[]")); err == nil {
					return addr.Unmap().String()
				}
			}
		}
	}

	if hasRemoteAddr {
		return remoteAddr.String()
	}
	return "unknown"
}

// ShutdownAll marks the server shutting down and cleanly terminates all active log streams (H3/H4).
func (s *Server) ShutdownAll(reason uint8) {
	s.lifecycleMu.Lock()
	s.shuttingDown = true
	handles := make([]logSessionHandle, 0, len(s.sessions))
	for _, h := range s.sessions {
		handles = append(handles, h)
	}
	s.lifecycleMu.Unlock()

	for _, h := range handles {
		_ = h.conn.WriteBinaryFrame(proto.EncodeCloseFrame(proto.ChLogs, reason))
		_ = h.conn.WriteCloseFrame(1001, "server stopping")
		h.cancel()
		_ = h.conn.Close()
	}
}

// Wait blocks until all active session goroutines (and their journalctl children) exit, up to timeout (H3).
func (s *Server) Wait(timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		s.sessionWG.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
	}
}

// ServeHTTP authenticates the Ed25519 ticket (scope=logs) and upgrades to a binary WebSocket.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clientIP := ExtractClientIP(r)
	safeIP := SanitizeLogField(clientIP)

	// G-L1: Fail closed if Verifier is not configured
	if s.cfg.Verifier == nil {
		http.Error(w, "ticket verifier not configured", http.StatusInternalServerError)
		return
	}

	// H4: Check shuttingDown & reserve connection slot BEFORE Verify() so idle shutdown never burns a JTI
	s.lifecycleMu.Lock()
	if s.shuttingDown {
		s.lifecycleMu.Unlock()
		http.Error(w, "log streamer shutting down; retry to wake worker", http.StatusServiceUnavailable)
		return
	}
	if !s.limiter.Allow(clientIP) {
		s.lifecycleMu.Unlock()
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=rate_limited\n", safeIP)
		http.Error(w, "too many handshake attempts", http.StatusTooManyRequests)
		return
	}
	if s.activeConns >= s.cfg.MaxConns {
		s.lifecycleMu.Unlock()
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=max_conns_reached\n", safeIP)
		http.Error(w, "too many active log streams", http.StatusTooManyRequests)
		return
	}
	s.activeConns++
	s.lastActive.Store(time.Now().UnixNano())
	s.lifecycleMu.Unlock()

	defer func() {
		s.lifecycleMu.Lock()
		s.activeConns--
		s.lastActive.Store(time.Now().UnixNano())
		s.lifecycleMu.Unlock()
	}()

	// FR-SEC-01: Reject tickets in query string; require Authorization: Bearer header
	if r.URL.Query().Get("ticket") != "" || r.URL.Query().Get("token") != "" {
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=query_ticket_forbidden\n", safeIP)
		http.Error(w, "ticket in query string forbidden (FR-SEC-01)", http.StatusUnauthorized)
		return
	}

	token := ExtractBearerToken(r)
	if token == "" {
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=missing_bearer\n", safeIP)
		http.Error(w, "missing Authorization Bearer ticket", http.StatusUnauthorized)
		return
	}

	claims, err := s.cfg.Verifier.Verify(token, "logs")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=%v\n", safeIP, err)
		http.Error(w, "invalid or expired logs ticket: "+err.Error(), http.StatusUnauthorized)
		return
	}

	conn, err := ws.UpgradeHTTP(w, r)
	if err != nil {
		return
	}

	safeDev := SanitizeLogField(claims.Dev)
	safeJTI := SanitizeLogField(claims.JTI)
	fmt.Fprintf(os.Stderr, "[NEXA-LOG] session_start ip=%s dev=%s jti=%s\n", safeIP, safeDev, safeJTI)

	sessCtx, sessCancel := context.WithCancel(r.Context())
	s.lifecycleMu.Lock()
	if s.shuttingDown {
		s.lifecycleMu.Unlock()
		sessCancel()
		_ = conn.WriteCloseFrame(1001, "server stopping")
		_ = conn.Close()
		return
	}
	s.nextSessID++
	sessID := s.nextSessID
	s.sessions[sessID] = logSessionHandle{conn: conn, cancel: sessCancel}
	s.sessionWG.Add(1)
	s.lifecycleMu.Unlock()

	defer func() {
		sessCancel()
		_ = conn.Close()
		s.lifecycleMu.Lock()
		delete(s.sessions, sessID)
		s.lifecycleMu.Unlock()
		s.sessionWG.Done()
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] session_end ip=%s dev=%s jti=%s\n", safeIP, safeDev, safeJTI)
	}()

	s.handleSession(sessCtx, conn)
}

// StartIdleWatchdog monitors active connections and triggers OnIdleShutdown after IdleTimeout (90s).
func (s *Server) StartIdleWatchdog(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.lifecycleMu.Lock()
			if s.shuttingDown {
				s.lifecycleMu.Unlock()
				return
			}
			if s.activeConns > 0 {
				s.lastActive.Store(time.Now().UnixNano())
				s.lifecycleMu.Unlock()
				continue
			}
			idleDur := time.Duration(time.Now().UnixNano() - s.lastActive.Load())
			if idleDur >= s.cfg.IdleTimeout {
				// H4: Flip shuttingDown atomically under lifecycleMu before invoking shutdown callback
				s.shuttingDown = true
				s.lifecycleMu.Unlock()
				if s.cfg.OnIdleShutdown != nil {
					s.cfg.OnIdleShutdown()
				}
				return
			}
			s.lifecycleMu.Unlock()
		}
	}
}

// ResolveListener returns a systemd socket-activated listener (LISTEN_FDS) if present,
// marking FD 3 FD_CLOEXEC and unsetting LISTEN_* env vars so child shells never inherit
// the listening socket (G-C4), or binds the provided unixSocketPath / tcpAddr fallback.
func ResolveListener(unixSocketPath, tcpAddr string) (net.Listener, error) {
	if rawFDs := strings.TrimSpace(os.Getenv("LISTEN_FDS")); rawFDs != "" {
		pidStr := strings.TrimSpace(os.Getenv("LISTEN_PID"))
		_ = os.Unsetenv("LISTEN_FDS")
		_ = os.Unsetenv("LISTEN_PID")
		_ = os.Unsetenv("LISTEN_FDNAMES")

		if pidStr != "" {
			if pid, err := strconv.Atoi(pidStr); err != nil || pid != os.Getpid() {
				return nil, fmt.Errorf("LISTEN_PID mismatch: env=%q self=%d", pidStr, os.Getpid())
			}
		}
		nFDs, err := strconv.Atoi(rawFDs)
		if err != nil || nFDs < 1 {
			return nil, fmt.Errorf("invalid LISTEN_FDS value: %q", rawFDs)
		}
		// Prevent FD 3 (and any additional systemd socket FDs) from leaking across execve into bash
		for i := 0; i < nFDs; i++ {
			setFDCloExec(3 + i)
		}
		f := os.NewFile(3, "systemd-socket")
		if f == nil {
			return nil, errors.New("failed wrapping systemd socket FD 3")
		}
		defer f.Close()
		ln, err := net.FileListener(f)
		if err != nil {
			return nil, fmt.Errorf("net.FileListener(FD 3): %w", err)
		}
		return ln, nil
	}
	if unixSocketPath != "" {
		_ = os.Remove(unixSocketPath)
		return net.Listen("unix", unixSocketPath)
	}
	if tcpAddr == "" {
		tcpAddr = "127.0.0.1:3091"
	}
	return net.Listen("tcp", tcpAddr)
}

type taggedLogRecord struct {
	gen uint64
	rec proto.LogRecord
}

func (s *Server) handleSession(parentCtx context.Context, conn *ws.Conn) {
	ctx, cancel := context.WithCancel(parentCtx)
	defer cancel()

	var (
		mu             sync.Mutex
		credit         int64 = proto.InitialLogCredit
		pausedSince    time.Time
		currentFilter  = proto.LogOpenParams{UnitMask: proto.AllowedUnitMask, MinPrio: proto.PrioDebug, CatMask: 0, TailLines: 50}
		currentGen     uint64
		producerCancel context.CancelFunc
		producerWG     sync.WaitGroup
		rawCh          = make(chan taggedLogRecord, 512)
		resetCh        = make(chan uint64, 8)
	)

	startOrRestartProducer := func(params proto.LogOpenParams) {
		mu.Lock()
		if producerCancel != nil {
			producerCancel()
		}
		currentGen++
		gen := currentGen
		pCtx, pCancel := context.WithCancel(ctx)
		producerCancel = pCancel
		currentFilter = params
		// C3: Reset credit and pause clock on every fresh OPEN/filter resubscription
		credit = proto.InitialLogCredit
		pausedSince = time.Time{}
		mu.Unlock()

		// Signal writer loop to discard stale records & droppedCount from old filter generation (G-H2)
		select {
		case resetCh <- gen:
		default:
			select {
			case <-resetCh:
			default:
			}
			select {
			case resetCh <- gen:
			default:
			}
		}

		producerWG.Add(1)
		go func() {
			defer producerWG.Done()
			localOut := make(chan proto.LogRecord, 128)
			done := make(chan struct{})
			go func() {
				defer close(done)
				for {
					select {
					case <-pCtx.Done():
						return
					case rec, ok := <-localOut:
						if !ok {
							return
						}
						select {
						case <-pCtx.Done():
							return
						case rawCh <- taggedLogRecord{gen: gen, rec: rec}:
						}
					}
				}
			}()
			_ = s.cfg.Producer(pCtx, params, localOut)
			close(localOut)
			<-done
		}()
	}

	defer func() {
		mu.Lock()
		if producerCancel != nil {
			producerCancel()
		}
		mu.Unlock()
		producerWG.Wait()
	}()

	// Reader goroutine: processes OPEN, CREDIT, CLOSE, and PING frames from phone
	go func() {
		defer cancel()
		for {
			// G-H3: Enforce read deadline so half-open TCP connections cannot keep journalctl alive forever
			_ = conn.SetReadDeadline(time.Now().Add(s.cfg.ReadDeadline))
			frame, err := conn.ReadBinaryFrame()
			if err != nil {
				return
			}
			ch, op, payload, err := proto.DecodeFrame(frame)
			if err != nil {
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(proto.ChControl, proto.ErrInvalidFrame, err.Error()))
				_ = conn.WriteCloseFrame(1002, "invalid frame")
				return
			}

			switch {
			case ch == proto.ChControl && op == proto.OpPing:
				pong, _ := proto.EncodeFrame(proto.ChControl, proto.OpPong, nil)
				_ = conn.WriteBinaryFrame(pong)

			case ch == proto.ChLogs && op == proto.OpOpen:
				params, err := proto.DecodeLogOpen(payload)
				if err != nil {
					_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(proto.ChLogs, proto.ErrInvalidFrame, "invalid OPEN payload"))
					_ = conn.WriteCloseFrame(1002, "invalid OPEN")
					return
				}
				// FR-LOG-02: Reject any unit bit outside the 4 whitelisted units (0x0F)
				if (params.UnitMask &^ proto.AllowedUnitMask) != 0 {
					_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(proto.ChLogs, proto.ErrForbiddenUnit, "unit outside whitelist rejected"))
					_ = conn.WriteCloseFrame(1008, "forbidden unit")
					return
				}
				if params.UnitMask == 0 {
					params.UnitMask = proto.AllowedUnitMask
				}
				if params.MinPrio == 0 {
					params.MinPrio = proto.PrioDebug
				}
				if params.TailLines > 500 {
					params.TailLines = 500
				}
				startOrRestartProducer(params)

			case ch == proto.ChLogs && op == proto.OpCredit:
				addBytes, err := proto.DecodeCredit(payload)
				if err != nil {
					_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(proto.ChLogs, proto.ErrInvalidFrame, "invalid CREDIT payload"))
					_ = conn.WriteCloseFrame(1002, "invalid CREDIT")
					return
				}
				mu.Lock()
				if addBytes == 0 {
					// Protocol-level pause signal (FR-LOG-10)
					credit = 0
					if pausedSince.IsZero() {
						pausedSince = time.Now()
					}
				} else {
					credit += int64(addBytes)
					if credit > 256*1024 {
						credit = 256 * 1024
					}
					pausedSince = time.Time{}
				}
				mu.Unlock()

			case (ch == proto.ChLogs || ch == proto.ChControl) && op == proto.OpClose:
				_ = conn.WriteCloseFrame(1000, "")
				return

			default:
				// M2: Reject unknown channel/opcode frames explicitly instead of silently ignoring
				_ = conn.WriteBinaryFrame(proto.EncodeErrFrame(proto.ChControl, proto.ErrInvalidFrame, fmt.Sprintf("unsupported frame ch=0x%02x op=0x%02x", ch, op)))
				_ = conn.WriteCloseFrame(1002, "unsupported frame")
				return
			}
		}
	}()

	// Writer & 150ms Batching / Rate-Limiting Loop (FR-LOG-07, FR-LOG-10)
	// G-M4: Fixed-size circular ring array so old LogRecord strings are always cleared and never leak memory.
	var (
		ringBuf      [MaxRingQueueRecords]proto.LogRecord
		ringHead     int
		ringLen      int
		droppedCount int
		activeGen    uint64
		batchTicker  = time.NewTicker(s.cfg.BatchInterval)
	)
	defer batchTicker.Stop()

	clearRing := func() {
		for i := 0; i < ringLen; i++ {
			idx := (ringHead + i) % MaxRingQueueRecords
			ringBuf[idx] = proto.LogRecord{}
		}
		ringHead = 0
		ringLen = 0
		droppedCount = 0
	}

	pushRing := func(rec proto.LogRecord) {
		if ringLen >= MaxRingQueueRecords {
			ringBuf[ringHead] = proto.LogRecord{}
			ringHead = (ringHead + 1) % MaxRingQueueRecords
			ringLen--
			droppedCount++
		}
		tail := (ringHead + ringLen) % MaxRingQueueRecords
		ringBuf[tail] = rec
		ringLen++
	}

	popFront := func() proto.LogRecord {
		rec := ringBuf[ringHead]
		ringBuf[ringHead] = proto.LogRecord{}
		ringHead = (ringHead + 1) % MaxRingQueueRecords
		ringLen--
		return rec
	}

	for {
		select {
		case <-ctx.Done():
			return

		case newGen := <-resetCh:
			if newGen > activeGen {
				activeGen = newGen
				clearRing()
			}

		case item, ok := <-rawCh:
			if !ok {
				return
			}
			mu.Lock()
			filter := currentFilter
			latestGen := currentGen
			mu.Unlock()

			if item.gen < activeGen || item.gen < latestGen {
				continue
			}
			if item.gen > activeGen {
				activeGen = item.gen
				clearRing()
			}
			if !proto.MatchesFilter(item.rec, filter) {
				continue
			}
			pushRing(item.rec)

		case <-batchTicker.C:
			// Drain any pending generation reset before flushing
			select {
			case newGen := <-resetCh:
				if newGen > activeGen {
					activeGen = newGen
					clearRing()
				}
			default:
			}

			mu.Lock()
			availCredit := credit
			pSince := pausedSince
			mu.Unlock()

			// FR-LOG-10: Close stream if paused (> 5 minutes without sufficient credit)
			if !pSince.IsZero() && time.Since(pSince) >= s.cfg.PauseTimeout {
				_ = conn.WriteBinaryFrame(proto.EncodeCloseFrame(proto.ChLogs, proto.CloseIdle))
				_ = conn.WriteCloseFrame(1000, "pause timeout")
				return
			}

			if availCredit <= 0 || (ringLen == 0 && droppedCount == 0) {
				continue
			}

			// Paced draining (FR-LOG-07): dequeue up to MaxLinesPerBatch (30) lines per 150ms tick
			// without discarding buffered records still fitting in ringBuf. Genuine spikes exceeding
			// MaxRingQueueRecords evict oldest in pushRing and prepend the synthetic overflow banner.
			maxDataRecords := MaxLinesPerBatch
			if droppedCount > 0 {
				// Reserve 1 slot for synthetic overflow banner when ring overflow occurred
				maxDataRecords = MaxLinesPerBatch - 1
			}
			toSend := ringLen
			if toSend > maxDataRecords {
				toSend = maxDataRecords
			}

			// Build batch slice to send (optional synthetic overflow banner first)
			batch := make([]proto.LogRecord, 0, toSend+1)
			synthIncluded := false
			savedDropCount := droppedCount
			if droppedCount > 0 {
				batch = append(batch, proto.LogRecord{
					Prio:        proto.PrioWarn,
					UnitID:      proto.UnitNexaIO,
					CatFlags:    proto.CatSynthetic,
					TimestampMs: uint64(time.Now().UnixMilli()),
					Message:     fmt.Sprintf("--- %d baris dilewati karena lonjakan data ---", droppedCount),
				})
				synthIncluded = true
			}
			for i := 0; i < toSend; i++ {
				batch = append(batch, ringBuf[(ringHead+i)%MaxRingQueueRecords])
			}

			var framePayload []byte
			var consumedBatch int
			var sentBytes int64

			for i, rec := range batch {
				encoded := proto.EncodeLogRecord(rec)
				// G-H1: Account for ALREADY-SENT sentBytes in this tick, not only current framePayload!
				if sentBytes+int64(len(framePayload)+len(encoded)) > availCredit {
					break
				}
				if len(framePayload)+len(encoded) > proto.MaxFramePayloadBytes {
					if len(framePayload) > 0 {
						frame, err := proto.EncodeFrame(proto.ChLogs, proto.OpData, framePayload)
						if err == nil {
							if err := conn.WriteBinaryFrame(frame); err != nil {
								return
							}
							sentBytes += int64(len(framePayload))
						}
						framePayload = nil
					}
				}
				framePayload = append(framePayload, encoded...)
				consumedBatch = i + 1
			}

			if len(framePayload) > 0 {
				frame, err := proto.EncodeFrame(proto.ChLogs, proto.OpData, framePayload)
				if err == nil {
					if err := conn.WriteBinaryFrame(frame); err != nil {
						return
					}
					sentBytes += int64(len(framePayload))
				}
			}

			if consumedBatch > 0 {
				dataConsumed := consumedBatch
				if synthIncluded {
					droppedCount = 0
					dataConsumed = consumedBatch - 1
				}
				for i := 0; i < dataConsumed && ringLen > 0; i++ {
					_ = popFront()
				}
				mu.Lock()
				credit -= sentBytes
				if credit <= 0 {
					credit = 0
					if pausedSince.IsZero() {
						pausedSince = time.Now()
					}
				}
				mu.Unlock()
			} else if len(batch) > 0 {
				// G-H1: Credit > 0 but smaller than next encoded record -> start PauseTimeout clock!
				droppedCount = savedDropCount
				mu.Lock()
				if pausedSince.IsZero() {
					pausedSince = time.Now()
				}
				mu.Unlock()
			}
		}
	}
}

// journalField decodes `journalctl -o json` fields that may be either a UTF-8 JSON string,
// an array of raw byte integers (when MESSAGE contains ANSI/control bytes), or null (G-C6).
type journalField string

func (jf *journalField) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		*jf = ""
		return nil
	}
	if trimmed[0] == '"' {
		var s string
		if err := json.Unmarshal(trimmed, &s); err != nil {
			return err
		}
		*jf = journalField(s)
		return nil
	}
	if trimmed[0] == '[' {
		var nums []int
		if err := json.Unmarshal(trimmed, &nums); err != nil {
			return err
		}
		raw := make([]byte, len(nums))
		for i, n := range nums {
			raw[i] = byte(n & 0xFF)
		}
		*jf = journalField(strings.ToValidUTF8(string(raw), "\uFFFD"))
		return nil
	}
	*jf = journalField(string(trimmed))
	return nil
}

// journalEntry models key fields from `journalctl -o json`.
type journalEntry struct {
	Message           journalField `json:"MESSAGE"`
	Priority          journalField `json:"PRIORITY"`
	SystemdUnit       journalField `json:"_SYSTEMD_UNIT"`
	UnitField         journalField `json:"UNIT"`
	PID               journalField `json:"_PID"`
	SyslogIdentifier  journalField `json:"SYSLOG_IDENTIFIER"`
	Transport         journalField `json:"_TRANSPORT"`
	RealtimeTimestamp journalField `json:"__REALTIME_TIMESTAMP"`
}

func isWhitelistedSystemdTargetUnit(u string) bool {
	switch strings.ToLower(strings.TrimSpace(u)) {
	case "nexa-server.service", "pm2-nexa.service", "caddy.service",
		"nexa-log.service", "nexa-log.socket",
		"nexa-term.service", "nexa-term.socket":
		return true
	default:
		return false
	}
}

// buildJournalctlArgs builds explicit, `+`-disjoined journalctl match arguments strictly
// scoped to the 4 whitelisted units (FR-LOG-02 / G-C7 / H5), with `--no-pager`, native `-p`
// priority filter for all severity levels < DEBUG, and PID 1 lifecycle events scoped ONLY to
// N.E.X.A + Caddy units (eliminating sysstat-collect.service flood!).
func buildJournalctlArgs(params proto.LogOpenParams) []string {
	tailScan := int(params.TailLines)
	if params.CatMask != 0 && tailScan > 0 {
		// Scan deeper so category-filtered views (FINANCE/BRIDGE) find recent matching entries
		// even when buried behind 100+ routine INFO lines.
		tailScan = tailScan * 10
		if tailScan < 1000 {
			tailScan = 1000
		}
		if tailScan > 2000 {
			tailScan = 2000
		}
	}

	args := []string{"--no-pager", "-f", "-o", "json", "-n", strconv.Itoa(tailScan)}
	if params.MinPrio > 0 && params.MinPrio < proto.PrioDebug {
		// Native RFC 5424 severity filter for ERROR/WARN/INFO
		args = append(args, "-p", strconv.Itoa(int(params.MinPrio)))
	}

	var clauses [][]string

	if (params.UnitMask & (1 << proto.UnitNexaServer)) != 0 {
		clauses = append(clauses, []string{"_SYSTEMD_UNIT=nexa-server.service"})
		clauses = append(clauses, []string{"_SYSTEMD_UNIT=pm2-nexa.service"})
	}
	if (params.UnitMask & (1 << proto.UnitCaddy)) != 0 {
		clauses = append(clauses, []string{"_SYSTEMD_UNIT=caddy.service"})
	}
	if (params.UnitMask & (1 << proto.UnitSystemd)) != 0 {
		// H5: Kernel logs + PID 1 lifecycle events STRICTLY for whitelisted N.E.X.A/Caddy units
		clauses = append(clauses, []string{"_TRANSPORT=kernel"})
		clauses = append(clauses, []string{"_PID=1", "UNIT=nexa-server.service"})
		clauses = append(clauses, []string{"_PID=1", "UNIT=pm2-nexa.service"})
		clauses = append(clauses, []string{"_PID=1", "UNIT=caddy.service"})
		clauses = append(clauses, []string{"_PID=1", "UNIT=nexa-log.service"})
		clauses = append(clauses, []string{"_PID=1", "UNIT=nexa-term.service"})
	}
	if (params.UnitMask & (1 << proto.UnitNexaIO)) != 0 {
		clauses = append(clauses, []string{"_SYSTEMD_UNIT=nexa-log.service"})
		clauses = append(clauses, []string{"_SYSTEMD_UNIT=nexa-term.service"})
	}

	if len(clauses) == 0 {
		return nil
	}
	for i, clause := range clauses {
		if i > 0 {
			args = append(args, "+")
		}
		args = append(args, clause...)
	}
	return args
}

type pm2InitialSource struct {
	path        string
	defaultPrio uint8
	tailLines   int
	f           *os.File
	info        os.FileInfo
	reader      *bufio.Reader
	recent      []proto.LogRecord
	partial     string
	opened      bool
}

func (s *Server) defaultJournalAndPM2Producer(ctx context.Context, params proto.LogOpenParams, out chan<- proto.LogRecord) error {
	var wg sync.WaitGroup

	// 1. C4: Always spawn PM2 tailers when nexa-server unit (bit 0) is enabled.
	// Read initial tails of out.log and err.log deterministically ordered by file ModTime()
	// (older file emitted first, newer file emitted last) so goroutine scheduling never buries
	// fresh out.log INFO lines behind older err.log WARN/ERROR lines.
	if (params.UnitMask & (1 << proto.UnitNexaServer)) != 0 {
		outPath := s.cfg.PM2OutLogPath
		if outPath == "" {
			outPath = DefaultPM2OutPath
		}
		errPath := s.cfg.PM2ErrLogPath
		if errPath == "" {
			errPath = DefaultPM2ErrPath
		}

		baseTail := int(params.TailLines)
		errTail := baseTail
		if params.CatMask == 0 && (params.MinPrio == 0 || params.MinPrio > proto.PrioError) && baseTail > 0 {
			// In ALL mode, balance err.log initial tail so stale errors don't crowd out fresh out.log INFO lines.
			capErr := baseTail / 3
			if capErr < 10 && baseTail >= 10 {
				capErr = 10
			}
			if capErr > 30 {
				capErr = 30
			}
			if errTail > capErr {
				errTail = capErr
			}
		}

		var sources []*pm2InitialSource
		if outPath != "" && outPath != "-" {
			sources = append(sources, &pm2InitialSource{
				path:        outPath,
				defaultPrio: proto.PrioInfo,
				tailLines:   baseTail,
			})
		}
		if errPath != "" && errPath != "-" && errPath != outPath {
			sources = append(sources, &pm2InitialSource{
				path:        errPath,
				defaultPrio: proto.PrioError,
				tailLines:   errTail,
			})
		}

		for _, src := range sources {
			f, info, reader, recent, partial, openErr := openPM2FileForTail(src.path, src.defaultPrio, params, src.tailLines, false)
			if openErr == nil {
				src.f = f
				src.info = info
				src.reader = reader
				src.recent = recent
				src.partial = partial
				src.opened = true
			}
		}

		// Order opened sources by ModTime ascending (older file first, newer file last)
		if len(sources) == 2 && sources[0].opened && sources[1].opened {
			if sources[0].info.ModTime().After(sources[1].info.ModTime()) {
				sources[0], sources[1] = sources[1], sources[0]
			}
		}

		// Emit initial tail records deterministically before live polling begins
		aborted := false
		for _, src := range sources {
			if !src.opened {
				continue
			}
			for _, rec := range src.recent {
				select {
				case <-ctx.Done():
					aborted = true
				case out <- rec:
				}
				if aborted {
					break
				}
			}
			src.recent = nil
			if aborted {
				break
			}
		}

		if aborted {
			for _, src := range sources {
				if src.f != nil {
					_ = src.f.Close()
				}
			}
			return nil
		}

		// Hand off each file handle (or missing-file retry) to live 250ms tailer goroutines
		for _, src := range sources {
			srcCopy := src
			wg.Add(1)
			go func() {
				defer wg.Done()
				if srcCopy.opened {
					tailPM2LiveLoop(ctx, srcCopy.path, srcCopy.defaultPrio, params, out, srcCopy.f, srcCopy.info, srcCopy.reader, srcCopy.partial)
				} else {
					tailPM2File(ctx, srcCopy.path, srcCopy.defaultPrio, params, out)
				}
			}()
		}
	}

	// 2. Spawn journalctl -f -o json for whitelisted systemd units (FR-LOG-02 / G-C7 / H5)
	args := buildJournalctlArgs(params)
	if len(args) > 0 {
		cmd := exec.CommandContext(ctx, "journalctl", args...)
		stdout, err := cmd.StdoutPipe()
		if err == nil && cmd.Start() == nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer func() {
					if cmd.Process != nil {
						_ = cmd.Process.Kill()
					}
					_ = cmd.Wait()
				}()

				// G-M4: Use bufio.Reader instead of bufio.Scanner so entries > 256 KiB never kill the reader
				br := bufio.NewReaderSize(stdout, 64*1024)
				for {
					select {
					case <-ctx.Done():
						return
					default:
					}
					line, readErr := readLineCapped(br, maxJournalLineBytes)
					if len(line) > 0 {
						if rec, ok := parseJournalJSONLine(line); ok {
							select {
							case <-ctx.Done():
								return
							case out <- rec:
							}
						}
					}
					if readErr != nil {
						return
					}
				}
			}()
		}
	}

	wg.Wait()
	return nil
}

// readLineCapped reads one newline-delimited line from br, discarding trailing bytes beyond maxBytes
// instead of failing permanently like bufio.Scanner or exhausting memory like ReadString.
func readLineCapped(br *bufio.Reader, maxBytes int) ([]byte, error) {
	var out []byte
	for {
		frag, err := br.ReadSlice('\n')
		if len(out) < maxBytes {
			remaining := maxBytes - len(out)
			if len(frag) > remaining {
				out = append(out, frag[:remaining]...)
			} else {
				out = append(out, frag...)
			}
		}
		if errors.Is(err, bufio.ErrBufferFull) {
			continue
		}
		return bytes.TrimRight(out, "\r\n"), err
	}
}

// readLineCappedWithNewline reads up to '\n' (capped at maxBytes) and reports whether '\n' was seen.
func readLineCappedWithNewline(br *bufio.Reader, maxBytes int) (line []byte, hasNewline bool, err error) {
	for {
		frag, readErr := br.ReadSlice('\n')
		if len(frag) > 0 {
			if frag[len(frag)-1] == '\n' {
				hasNewline = true
			}
			if len(line) < maxBytes {
				rem := maxBytes - len(line)
				if len(frag) > rem {
					line = append(line, frag[:rem]...)
				} else {
					line = append(line, frag...)
				}
			}
		}
		if errors.Is(readErr, bufio.ErrBufferFull) {
			continue
		}
		return bytes.TrimRight(line, "\r\n"), hasNewline, readErr
	}
}

func parseJournalJSONLine(line []byte) (proto.LogRecord, bool) {
	var je journalEntry
	if err := json.Unmarshal(line, &je); err != nil {
		return proto.LogRecord{}, false
	}
	msgStr := strings.TrimSpace(string(je.Message))
	if msgStr == "" {
		return proto.LogRecord{}, false
	}

	prio := proto.PrioInfo
	if p, err := strconv.Atoi(strings.TrimSpace(string(je.Priority))); err == nil && p >= 0 && p <= 7 {
		prio = uint8(p)
	}

	// H5 / G-C7: Check kernel-trusted _SYSTEMD_UNIT BEFORE user-spoofable SYSLOG_IDENTIFIER!
	// This prevents `logger -t nexa-server` from inside nexa-term.service from forging nexa-server logs,
	// and drops unrelated PID 1 lifecycle noise such as sysstat-collect.service.
	unitName := strings.ToLower(strings.TrimSpace(string(je.SystemdUnit)))
	targetUnit := strings.ToLower(strings.TrimSpace(string(je.UnitField)))
	identName := strings.ToLower(strings.TrimSpace(string(je.SyslogIdentifier)))
	transport := strings.ToLower(strings.TrimSpace(string(je.Transport)))
	pidStr := strings.TrimSpace(string(je.PID))

	var unitID uint8
	switch {
	case unitName == "nexa-server.service" || unitName == "pm2-nexa.service":
		unitID = proto.UnitNexaServer
	case unitName == "caddy.service":
		unitID = proto.UnitCaddy
	case unitName == "nexa-log.service" || unitName == "nexa-term.service":
		unitID = proto.UnitNexaIO
	case unitName == "init.scope":
		if !isWhitelistedSystemdTargetUnit(targetUnit) {
			return proto.LogRecord{}, false
		}
		unitID = proto.UnitSystemd
	case unitName != "":
		// Any other explicit systemd unit (sshd.service, sysstat-collect.service, cron.service, etc.)
		// is strictly rejected even if SYSLOG_IDENTIFIER was spoofed.
		return proto.LogRecord{}, false
	case transport == "kernel":
		unitID = proto.UnitSystemd
	case (pidStr == "1" || identName == "systemd") && isWhitelistedSystemdTargetUnit(targetUnit):
		unitID = proto.UnitSystemd
	default:
		return proto.LogRecord{}, false
	}

	tsMs := uint64(time.Now().UnixMilli())
	if us, err := strconv.ParseUint(strings.TrimSpace(string(je.RealtimeTimestamp)), 10, 64); err == nil && us > 0 {
		tsMs = us / 1000
	}

	catFlags, cleanMsg := proto.ParseCategoryPrefix(msgStr)
	return proto.LogRecord{
		Prio:        prio,
		UnitID:      unitID,
		CatFlags:    catFlags,
		TimestampMs: tsMs,
		Message:     cleanMsg,
	}, true
}

func openPM2FileForTail(
	filePath string,
	defaultPrio uint8,
	params proto.LogOpenParams,
	initialTail int,
	fromStart bool,
) (*os.File, os.FileInfo, *bufio.Reader, []proto.LogRecord, string, error) {
	hasSelectiveFilter := params.CatMask != 0 || (params.MinPrio > 0 && params.MinPrio <= proto.PrioError)
	seekWindowBytes := int64(32 * 1024)
	if hasSelectiveFilter {
		// Scan up to 256 KiB when filtering by category/ERROR so recent matches buried behind
		// routine INFO lines are still surfaced cleanly.
		seekWindowBytes = 256 * 1024
	}

	f, err := os.Open(filePath)
	if err != nil {
		return nil, nil, nil, nil, "", err
	}
	info, statErr := f.Stat()
	if statErr != nil {
		_ = f.Close()
		return nil, nil, nil, nil, "", statErr
	}

	if fromStart {
		return f, info, bufio.NewReaderSize(f, 32*1024), nil, "", nil
	}

	// G-M1: If tailLines == 0, start live tailing directly from EOF
	if initialTail <= 0 {
		_, _ = f.Seek(0, io.SeekEnd)
		return f, info, bufio.NewReaderSize(f, 32*1024), nil, "", nil
	}

	seekedMidFile := false
	if info.Size() > seekWindowBytes {
		_, _ = f.Seek(info.Size()-seekWindowBytes, io.SeekStart)
		seekedMidFile = true
	}
	reader := bufio.NewReaderSize(f, 32*1024)
	if seekedMidFile {
		// G-M1 / C4: Discard truncated first partial line safely with cap
		_, _, _ = readLineCappedWithNewline(reader, maxPM2LineBytes)
	}

	var recent []proto.LogRecord
	var partial string
	for {
		chunk, hasNL, readErr := readLineCappedWithNewline(reader, maxPM2LineBytes)
		if len(chunk) > 0 || hasNL {
			if hasNL {
				full := strings.TrimSpace(partial + string(chunk))
				partial = ""
				if full != "" {
					rec := parsePM2Line(full, defaultPrio)
					if !hasSelectiveFilter || proto.MatchesFilter(rec, params) {
						recent = append(recent, rec)
						if len(recent) > initialTail {
							recent = recent[1:]
						}
					}
				}
			} else if len(partial) < maxPM2LineBytes {
				rem := maxPM2LineBytes - len(partial)
				if len(chunk) > rem {
					partial += string(chunk[:rem])
				} else {
					partial += string(chunk)
				}
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			_ = f.Close()
			return nil, nil, nil, nil, "", readErr
		}
	}
	return f, info, reader, recent, partial, nil
}

func drainPM2Lines(ctx context.Context, reader *bufio.Reader, partial *string, defaultPrio uint8, out chan<- proto.LogRecord, flushPartial bool) {
	for {
		chunk, hasNL, readErr := readLineCappedWithNewline(reader, maxPM2LineBytes)
		if len(chunk) > 0 || hasNL {
			if hasNL {
				full := strings.TrimSpace(*partial + string(chunk))
				*partial = ""
				if full != "" {
					emitPM2Line(ctx, full, defaultPrio, out)
				}
			} else if len(*partial) < maxPM2LineBytes {
				rem := maxPM2LineBytes - len(*partial)
				if len(chunk) > rem {
					*partial += string(chunk[:rem])
				} else {
					*partial += string(chunk)
				}
			}
		}
		if readErr != nil {
			break
		}
	}
	if flushPartial && strings.TrimSpace(*partial) != "" {
		emitPM2Line(ctx, strings.TrimSpace(*partial), defaultPrio, out)
		*partial = ""
	}
}

func tailPM2LiveLoop(
	ctx context.Context,
	filePath string,
	defaultPrio uint8,
	params proto.LogOpenParams,
	out chan<- proto.LogRecord,
	f *os.File,
	curInfo os.FileInfo,
	reader *bufio.Reader,
	partial string,
) {
	defer func() {
		if f != nil {
			_ = f.Close()
		}
	}()

	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if f == nil {
				// Retry opening after transient rotation error (C4)
				nf, nInfo, nReader, _, _, openErr := openPM2FileForTail(filePath, defaultPrio, params, 0, true)
				if openErr != nil {
					continue
				}
				f = nf
				curInfo = nInfo
				reader = nReader
				partial = ""
			}

			// G-M1 / C4: Detect file rotation or truncation (logrotate / pm2-logrotate)
			if newInfo, statErr := os.Stat(filePath); statErr == nil {
				curPos, _ := f.Seek(0, io.SeekCurrent)
				rotated := !os.SameFile(curInfo, newInfo)
				truncated := newInfo.Size() < curPos
				if rotated || truncated {
					if rotated {
						// Drain any last unread bytes from old inode before switching
						drainPM2Lines(ctx, reader, &partial, defaultPrio, out, true)
					}
					_ = f.Close()
					f = nil
					nf, nInfo, nReader, _, _, openErr := openPM2FileForTail(filePath, defaultPrio, params, 0, true)
					if openErr != nil {
						// Retry on next tick instead of abandoning tailer permanently
						continue
					}
					f = nf
					curInfo = nInfo
					reader = nReader
					partial = ""
				}
			}

			drainPM2Lines(ctx, reader, &partial, defaultPrio, out, false)
		}
	}
}

func tailPM2File(ctx context.Context, filePath string, defaultPrio uint8, params proto.LogOpenParams, out chan<- proto.LogRecord) {
	tailLines := int(params.TailLines)

	// C4: Wait cleanly if file does not exist yet instead of exiting immediately
	var (
		f       *os.File
		curInfo os.FileInfo
		reader  *bufio.Reader
		recent  []proto.LogRecord
		partial string
		err     error
	)
	for {
		f, curInfo, reader, recent, partial, err = openPM2FileForTail(filePath, defaultPrio, params, tailLines, false)
		if err == nil {
			break
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(500 * time.Millisecond):
		}
	}

	for _, rec := range recent {
		select {
		case <-ctx.Done():
			_ = f.Close()
			return
		case out <- rec:
		}
	}

	tailPM2LiveLoop(ctx, filePath, defaultPrio, params, out, f, curInfo, reader, partial)
}

func parsePM2Line(rawLine string, defaultPrio uint8) proto.LogRecord {
	// G-C2: Strip optional PM2 timestamp prefix before parsing <N> priority & [cat=...]
	stripped := proto.StripPM2Timestamp(rawLine)
	parsedPrio, hasPrio, catFlags, cleanMsg := proto.ParseSyslogPriorityAndCategory(stripped)
	prio := defaultPrio
	if hasPrio {
		// Authoritative priority emitted by logger.js (distinguishes console.warn <4> from console.error <3> in err.log)
		prio = parsedPrio
	} else if prio > proto.PrioError {
		// Conservative heuristic for untagged legacy lines: avoid false positives on "errorCount=0"
		lower := strings.ToLower(cleanMsg)
		switch {
		case strings.Contains(lower, "[error]") || strings.Contains(lower, "❌") ||
			strings.Contains(lower, "typeerror:") || strings.Contains(lower, "referenceerror:") ||
			strings.Contains(lower, "syntaxerror:") || strings.Contains(lower, "unhandled") ||
			strings.Contains(lower, "fatal"):
			prio = proto.PrioError
		case strings.Contains(lower, "[warn]") || strings.Contains(lower, "⚠️"):
			if prio > proto.PrioWarn {
				prio = proto.PrioWarn
			}
		}
	}
	return proto.LogRecord{
		Prio:        prio,
		UnitID:      proto.UnitNexaServer,
		CatFlags:    catFlags,
		TimestampMs: uint64(time.Now().UnixMilli()),
		Message:     cleanMsg,
	}
}

func emitPM2Line(ctx context.Context, rawLine string, defaultPrio uint8, out chan<- proto.LogRecord) {
	rec := parsePM2Line(rawLine, defaultPrio)
	select {
	case <-ctx.Done():
	case out <- rec:
	}
}
