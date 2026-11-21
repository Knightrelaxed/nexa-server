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
	MaxLinesPerBatch     = 30 // 30 lines per 150ms = 200 lines/sec (FR-LOG-07)
	MaxRingQueueRecords  = 256
	DefaultPauseTimeout  = 5 * time.Minute
	DefaultIdleTimeout   = 90 * time.Second
	DefaultReadDeadline  = 45 * time.Second
	DefaultPM2OutPath    = "/var/log/nexa/out.log"
	DefaultPM2ErrPath    = "/var/log/nexa/err.log"
	maxJournalLineBytes  = 256 * 1024
)

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
	PM2OutLogPath  string
	PM2ErrLogPath  string
	OnIdleShutdown func()
}

// Server handles /io/logs WebSocket connections and enforces idle exit.
type Server struct {
	cfg         Config
	activeConns atomic.Int32
	lastActive  atomic.Int64
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
	s := &Server{cfg: cfg}
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

// ExtractClientIP extracts the client IP from X-Forwarded-For or RemoteAddr for audit logs (PRD 14.1).
func ExtractClientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		if idx := strings.IndexByte(xff, ','); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return xff
	}
	if host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr)); err == nil && host != "" {
		return host
	}
	if addr := strings.TrimSpace(r.RemoteAddr); addr != "" {
		return addr
	}
	return "unknown"
}

// ServeHTTP authenticates the Ed25519 ticket (scope=logs) and upgrades to a binary WebSocket.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clientIP := ExtractClientIP(r)

	// G-L1: Fail closed if Verifier is not configured
	if s.cfg.Verifier == nil {
		http.Error(w, "ticket verifier not configured", http.StatusInternalServerError)
		return
	}

	// FR-SEC-01: Reject tickets in query string; require Authorization: Bearer header
	if r.URL.Query().Get("ticket") != "" || r.URL.Query().Get("token") != "" {
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=query_ticket_forbidden\n", clientIP)
		http.Error(w, "ticket in query string forbidden (FR-SEC-01)", http.StatusUnauthorized)
		return
	}

	token := ExtractBearerToken(r)
	if token == "" {
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=missing_bearer\n", clientIP)
		http.Error(w, "missing Authorization Bearer ticket", http.StatusUnauthorized)
		return
	}

	claims, err := s.cfg.Verifier.Verify(token, "logs")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] auth_reject ip=%s reason=%v\n", clientIP, err)
		http.Error(w, "invalid or expired logs ticket: "+err.Error(), http.StatusUnauthorized)
		return
	}

	conn, err := ws.UpgradeHTTP(w, r)
	if err != nil {
		return
	}

	fmt.Fprintf(os.Stderr, "[NEXA-LOG] session_start ip=%s dev=%s jti=%s\n", clientIP, claims.Dev, claims.JTI)
	s.activeConns.Add(1)
	s.lastActive.Store(time.Now().UnixNano())
	defer func() {
		_ = conn.Close()
		s.activeConns.Add(-1)
		s.lastActive.Store(time.Now().UnixNano())
		fmt.Fprintf(os.Stderr, "[NEXA-LOG] session_end ip=%s dev=%s jti=%s\n", clientIP, claims.Dev, claims.JTI)
	}()

	s.handleSession(r.Context(), conn)
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
			if s.activeConns.Load() > 0 {
				s.lastActive.Store(time.Now().UnixNano())
				continue
			}
			idleDur := time.Duration(time.Now().UnixNano() - s.lastActive.Load())
			if idleDur >= s.cfg.IdleTimeout {
				if s.cfg.OnIdleShutdown != nil {
					s.cfg.OnIdleShutdown()
				}
				return
			}
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

		go func() {
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

			// G-H1: Trim ring to MaxLinesPerBatch FIRST so the synthetic overflow banner is NEVER trimmed away!
			maxDataRecords := MaxLinesPerBatch
			if droppedCount > 0 || ringLen > MaxLinesPerBatch {
				// Reserve 1 slot for synthetic banner if overflow occurred
				maxDataRecords = MaxLinesPerBatch - 1
			}
			if ringLen > maxDataRecords {
				excess := ringLen - maxDataRecords
				for i := 0; i < excess; i++ {
					_ = popFront()
				}
				droppedCount += excess
			}

			// Build batch slice to send (optional synthetic overflow banner first)
			batch := make([]proto.LogRecord, 0, ringLen+1)
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
			for i := 0; i < ringLen; i++ {
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
	SyslogIdentifier  journalField `json:"SYSLOG_IDENTIFIER"`
	Transport         journalField `json:"_TRANSPORT"`
	RealtimeTimestamp journalField `json:"__REALTIME_TIMESTAMP"`
}

// buildJournalctlArgs builds explicit, `+`-disjoined journalctl match arguments strictly
// scoped to the 4 whitelisted units (FR-LOG-02 / G-C7), with native `-p` priority filter
// for ERRORS ONLY and deeper `-n` scan window when category filtering is active.
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

	args := []string{"-f", "-o", "json", "-n", strconv.Itoa(tailScan)}
	if params.MinPrio > 0 && params.MinPrio <= proto.PrioError {
		// Native RFC 5424 severity filter so ERRORS ONLY fetches historical errors directly
		args = append(args, "-p", strconv.Itoa(int(params.MinPrio)))
	}

	var clauses [][]string

	if (params.UnitMask & (1 << proto.UnitNexaServer)) != 0 {
		clauses = append(clauses, []string{"_SYSTEMD_UNIT=nexa-server.service"})
	}
	if (params.UnitMask & (1 << proto.UnitCaddy)) != 0 {
		clauses = append(clauses, []string{"_SYSTEMD_UNIT=caddy.service"})
	}
	if (params.UnitMask & (1 << proto.UnitSystemd)) != 0 {
		clauses = append(clauses, []string{"_TRANSPORT=kernel"})
		clauses = append(clauses, []string{"SYSLOG_IDENTIFIER=systemd"})
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

func (s *Server) defaultJournalAndPM2Producer(ctx context.Context, params proto.LogOpenParams, out chan<- proto.LogRecord) error {
	var wg sync.WaitGroup

	// 1. G-C2: If PM2 transition log files exist and nexa-server unit (bit 0) is enabled, tail BOTH out and err files
	if (params.UnitMask & (1 << proto.UnitNexaServer)) != 0 {
		outPath := s.cfg.PM2OutLogPath
		if outPath == "" {
			outPath = DefaultPM2OutPath
		}
		if _, err := os.Stat(outPath); err == nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				tailPM2File(ctx, outPath, proto.PrioInfo, params, out)
			}()
		}

		errPath := s.cfg.PM2ErrLogPath
		if errPath == "" {
			errPath = DefaultPM2ErrPath
		}
		if errPath != "" && errPath != outPath {
			if _, err := os.Stat(errPath); err == nil {
				wg.Add(1)
				go func() {
					defer wg.Done()
					tailPM2File(ctx, errPath, proto.PrioError, params, out)
				}()
			}
		}
	}

	// 2. Spawn journalctl -f -o json for whitelisted systemd units (FR-LOG-02 / G-C7)
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
// instead of failing permanently like bufio.Scanner.
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

	// G-C7: Enforce strict FR-LOG-02 unit whitelist at parser layer as defense-in-depth
	unitName := strings.ToLower(strings.TrimSpace(string(je.SystemdUnit)))
	identName := strings.ToLower(strings.TrimSpace(string(je.SyslogIdentifier)))
	transport := strings.ToLower(strings.TrimSpace(string(je.Transport)))

	var unitID uint8
	switch {
	case unitName == "nexa-server.service" || identName == "nexa-server":
		unitID = proto.UnitNexaServer
	case unitName == "caddy.service" || identName == "caddy":
		unitID = proto.UnitCaddy
	case unitName == "nexa-log.service" || unitName == "nexa-term.service" ||
		identName == "nexa-log" || identName == "nexa-term" || identName == "nexa-io":
		unitID = proto.UnitNexaIO
	case transport == "kernel" || identName == "systemd" || identName == "kernel":
		unitID = proto.UnitSystemd
	default:
		// Reject non-whitelisted host units (e.g. sshd, sudo, cron)
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

func tailPM2File(ctx context.Context, filePath string, defaultPrio uint8, params proto.LogOpenParams, out chan<- proto.LogRecord) {
	tailLines := int(params.TailLines)
	hasSelectiveFilter := params.CatMask != 0 || (params.MinPrio > 0 && params.MinPrio <= proto.PrioError)
	seekWindowBytes := int64(32 * 1024)
	if hasSelectiveFilter {
		// Scan up to 256 KiB when filtering by category/ERROR so recent matches buried behind
		// routine INFO lines are still surfaced cleanly.
		seekWindowBytes = 256 * 1024
	}

	openAndSeek := func(initialTail int) (*os.File, os.FileInfo, *bufio.Reader, []proto.LogRecord, string, error) {
		f, err := os.Open(filePath)
		if err != nil {
			return nil, nil, nil, nil, "", err
		}
		info, statErr := f.Stat()
		if statErr != nil {
			_ = f.Close()
			return nil, nil, nil, nil, "", statErr
		}

		// G-M1: If tailLines == 0, start live tailing directly from EOF
		if initialTail <= 0 {
			_, _ = f.Seek(0, io.SeekEnd)
			return f, info, bufio.NewReader(f), nil, "", nil
		}

		seekedMidFile := false
		if info.Size() > seekWindowBytes {
			_, _ = f.Seek(info.Size()-seekWindowBytes, io.SeekStart)
			seekedMidFile = true
		}
		reader := bufio.NewReader(f)
		if seekedMidFile {
			// G-M1: Discard truncated first partial line after mid-file seek
			_, _ = reader.ReadString('\n')
		}

		var recent []proto.LogRecord
		var partial string
		for {
			chunk, readErr := reader.ReadString('\n')
			if len(chunk) > 0 {
				if strings.HasSuffix(chunk, "\n") {
					full := strings.TrimSpace(partial + chunk)
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
				} else {
					partial += chunk
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

	f, curInfo, reader, recent, partial, err := openAndSeek(tailLines)
	if err != nil {
		return
	}
	defer func() {
		if f != nil {
			_ = f.Close()
		}
	}()

	for _, rec := range recent {
		select {
		case <-ctx.Done():
			return
		case out <- rec:
		}
	}

	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// G-M1: Detect file rotation or truncation (logrotate / pm2-logrotate)
			if newInfo, statErr := os.Stat(filePath); statErr == nil {
				curPos, _ := f.Seek(0, io.SeekCurrent)
				rotated := !os.SameFile(curInfo, newInfo)
				truncated := newInfo.Size() < curPos
				if rotated || truncated {
					_ = f.Close()
					nf, nInfo, nReader, _, _, openErr := openAndSeek(0)
					if openErr != nil {
						return
					}
					// For newly rotated/truncated file, seek to start so no new lines are missed
					_, _ = nf.Seek(0, io.SeekStart)
					f = nf
					curInfo = nInfo
					reader = bufio.NewReader(f)
					_ = nReader
					partial = ""
				}
			}

			for {
				chunk, readErr := reader.ReadString('\n')
				if len(chunk) > 0 {
					if strings.HasSuffix(chunk, "\n") {
						full := strings.TrimSpace(partial + chunk)
						partial = ""
						if full != "" {
							emitPM2Line(ctx, full, defaultPrio, out)
						}
					} else {
						// G-M1: Retain incomplete line until '\n' arrives
						partial += chunk
					}
				}
				if readErr != nil {
					break
				}
			}
		}
	}
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
