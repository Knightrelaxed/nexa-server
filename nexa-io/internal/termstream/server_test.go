package termstream

import (
	"bufio"
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"nexa-io/internal/proto"
	"nexa-io/internal/ptyutil"
	"nexa-io/internal/ticket"
)

type fakePTY struct {
	mu       sync.Mutex
	outCh    chan []byte
	inBuf    bytes.Buffer
	rows     uint16
	cols     uint16
	winched  bool
	killed   bool
	closedCh chan struct{}
}

func newFakePTY(rows, cols uint16) *fakePTY {
	return &fakePTY{
		outCh:    make(chan []byte, 32),
		rows:     rows,
		cols:     cols,
		closedCh: make(chan struct{}),
	}
}

func (f *fakePTY) Read(b []byte) (int, error) {
	select {
	case <-f.closedCh:
		return 0, io.EOF
	case data := <-f.outCh:
		n := copy(b, data)
		return n, nil
	}
}

func (f *fakePTY) Write(b []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.inBuf.Write(b)
}

func (f *fakePTY) Resize(rows, cols uint16) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rows = rows
	f.cols = cols
	return nil
}

func (f *fakePTY) SignalWinch() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.winched = true
	return nil
}

func (f *fakePTY) KillGroup() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.killed {
		f.killed = true
		close(f.closedCh)
	}
	return nil
}

func (f *fakePTY) Close() error { return f.KillGroup() }

func issueTermTicket(t *testing.T, priv ed25519.PrivateKey, sid, jti string) string {
	t.Helper()
	payload, _ := json.Marshal(ticket.Claims{
		Scope: "term",
		SID:   sid,
		Exp:   time.Now().Add(45 * time.Second).Unix(),
		JTI:   jti,
		Dev:   "samsung-a33-tuan",
	})
	sig := ed25519.Sign(priv, payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func writeMaskedClientFrame(w io.Writer, payload []byte) error {
	maskKey := [4]byte{0xAA, 0xBB, 0xCC, 0xDD}
	hdr := []byte{0x82, 0x80 | byte(len(payload))}
	if _, err := w.Write(hdr); err != nil {
		return err
	}
	if _, err := w.Write(maskKey[:]); err != nil {
		return err
	}
	masked := make([]byte, len(payload))
	for i := range payload {
		masked[i] = payload[i] ^ maskKey[i%4]
	}
	_, err := w.Write(masked)
	return err
}

func readUnmaskedServerFrame(r *bufio.Reader) ([]byte, error) {
	var hdr [2]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return nil, err
	}
	length := int(hdr[1] & 0x7F)
	if length == 126 {
		var ext [2]byte
		if _, err := io.ReadFull(r, ext[:]); err != nil {
			return nil, err
		}
		length = int(binary.BigEndian.Uint16(ext[:]))
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func dialTermWS(t *testing.T, baseURL, tkt string) (net.Conn, *bufio.Reader) {
	t.Helper()
	addr := strings.TrimPrefix(baseURL, "http://")
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	handshake := "GET /io/term HTTP/1.1\r\n" +
		"Host: " + addr + "\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
		"Sec-WebSocket-Version: 13\r\n" +
		"Authorization: Bearer " + tkt + "\r\n\r\n"
	if _, err := conn.Write([]byte(handshake)); err != nil {
		t.Fatal(err)
	}
	br := bufio.NewReader(conn)
	statusLine, err := br.ReadString('\n')
	if err != nil || !strings.Contains(statusLine, "101") {
		t.Fatalf("expected 101 Switching Protocols, got %q (%v)", statusLine, err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}
	return conn, br
}

func TestReplayRingExactSliceAndOverflowDetection(t *testing.T) {
	ring := NewReplayRing(16)
	ring.Append([]byte("0123456789")) // sentOffset = 10
	ring.Append([]byte("ABCDEF"))     // sentOffset = 16

	data, ok := ring.SliceFrom(10)
	if !ok || string(data) != "ABCDEF" {
		t.Fatalf("expected ABCDEF, got ok=%v data=%q", ok, string(data))
	}

	// Append 4 more bytes -> total 20, oldest in ring is offset 4
	ring.Append([]byte("WXYZ"))
	data2, ok2 := ring.SliceFrom(12)
	if !ok2 || string(data2) != "CDEFWXYZ" {
		t.Fatalf("expected CDEFWXYZ, got ok=%v data=%q", ok2, string(data2))
	}

	// Request offset 2 (< oldest 4) -> overflow!
	_, okOld := ring.SliceFrom(2)
	if okOld {
		t.Fatal("expected overflow (ok=false) when requesting offset older than ring capacity")
	}

	// G-M5: Request offset ahead of sentOffset (99 > 20) -> desync overflow (ok=false)!
	_, okAhead := ring.SliceFrom(99)
	if okAhead {
		t.Fatal("expected desync overflow (ok=false) when receivedOffset > sentOffset (G-M5)")
	}
}

func TestKillSwitchDefaultsOffAndRejectsRequests(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	v, _ := ticket.NewVerifier(pub)
	srv := NewServer(Config{
		Verifier:       v,
		EnableFlagFile: "/nonexistent/nexa-terminal.enabled",
	})
	ts := httptest.NewServer(srv)
	defer ts.Close()

	sidRaw := make([]byte, 16)
	_, _ = rand.Read(sidRaw)
	sid := base64.RawURLEncoding.EncodeToString(sidRaw)
	tkt := issueTermTicket(t, priv, sid, "jti-ks-1")

	req, _ := http.NewRequest("GET", ts.URL+"/io/term", nil)
	req.Header.Set("Authorization", "Bearer "+tkt)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when kill switch is OFF, got %d", resp.StatusCode)
	}
}

func TestTerminalOpenDetachAndResumeReplaysMissedBytes(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	v, _ := ticket.NewVerifier(pub)

	createdPTYCh := make(chan *fakePTY, 1)
	srv := NewServer(Config{
		Verifier:      v,
		Enabled:       true,
		DetachTimeout: 5 * time.Second,
		GraceTimeout:  5 * time.Second,
		PTYFactory: func(rows, cols uint16) (ptyutil.Session, error) {
			p := newFakePTY(rows, cols)
			createdPTYCh <- p
			return p, nil
		},
	})
	ts := httptest.NewServer(srv)
	defer ts.Close()

	sidRaw := [16]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
	sidStr := base64.RawURLEncoding.EncodeToString(sidRaw[:])

	// 1. Open initial session
	tkt1 := issueTermTicket(t, priv, sidStr, "jti-open-1")
	conn1, br1 := dialTermWS(t, ts.URL, tkt1)
	openFrame, _ := proto.EncodeFrame(proto.ChTermMin, proto.OpOpen, proto.EncodeTermOpen(24, 80, sidRaw))
	if err := writeMaskedClientFrame(conn1, openFrame); err != nil {
		t.Fatal(err)
	}

	// Wait synchronously for PTY creation (zero data race under -race)
	var createdPTY *fakePTY
	select {
	case createdPTY = <-createdPTYCh:
	case <-time.After(2 * time.Second):
		t.Fatal("expected fakePTY to be created on OPEN")
	}
	createdPTY.outCh <- []byte("hello ")
	createdPTY.outCh <- []byte("world!")

	_ = conn1.SetReadDeadline(time.Now().Add(2 * time.Second))
	f1, err := readUnmaskedServerFrame(br1)
	if err != nil {
		t.Fatalf("failed reading first PTY output: %v", err)
	}
	_, op1, payload1, _ := proto.DecodeFrame(f1)
	if op1 != proto.OpData || string(payload1) != "hello " {
		t.Fatalf("unexpected first frame: op=%d payload=%q", op1, string(payload1))
	}

	// Suppose client received only the first 6 bytes ("hello ") before network dropped,
	// while server already sent/buffered "world!" (6 more bytes).
	time.Sleep(30 * time.Millisecond)
	_ = conn1.Close()
	time.Sleep(30 * time.Millisecond)

	// 2. Reconnect with a fresh Ed25519 ticket bearing the SAME sid and send RESUME(offset=6)
	tkt2 := issueTermTicket(t, priv, sidStr, "jti-resume-2")
	conn2, br2 := dialTermWS(t, ts.URL, tkt2)
	defer conn2.Close()

	resumeFrame, _ := proto.EncodeFrame(proto.ChTermMin, proto.OpResume, proto.EncodeTermResume(sidRaw, 6))
	if err := writeMaskedClientFrame(conn2, resumeFrame); err != nil {
		t.Fatal(err)
	}

	_ = conn2.SetReadDeadline(time.Now().Add(2 * time.Second))
	f2, err := readUnmaskedServerFrame(br2)
	if err != nil {
		t.Fatalf("failed reading replayed PTY output: %v", err)
	}
	_, op2, payload2, _ := proto.DecodeFrame(f2)
	if op2 != proto.OpData || string(payload2) != "world!" {
		t.Fatalf("expected replayed 'world!', got op=%d payload=%q", op2, string(payload2))
	}

	// 3. Explicit CLOSE kills the PTY process group cleanly
	closeFrame := proto.EncodeCloseFrame(proto.ChTermMin, proto.CloseClientExit)
	_ = writeMaskedClientFrame(conn2, closeFrame)
	time.Sleep(40 * time.Millisecond)
	createdPTY.mu.Lock()
	killed := createdPTY.killed
	createdPTY.mu.Unlock()
	if !killed {
		t.Fatal("expected PTY process group to be killed after CLOSE")
	}
}

func TestStaleGraceTimerDoesNotKillResumedSessionAndFailClosedNilVerifier(t *testing.T) {
	// G-L1: Nil verifier must fail closed
	nilSrv := NewServer(Config{Verifier: nil, Enabled: true})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/io/term", nil)
	req.Header.Set("Authorization", "Bearer anything")
	nilSrv.ServeHTTP(rr, req)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 fail-closed when Verifier is nil, got %d", rr.Code)
	}

	// G-H6: Calling terminateSessionIfDetached with stale detachGen must NOT kill active resumed session
	pty := newFakePTY(24, 80)
	sess := &termSession{
		sid:       "sid-race",
		deviceID:  "dev-1",
		pty:       pty,
		ring:      NewReplayRing(1024),
		createdAt: time.Now(),
		stdinCh:   make(chan []byte, 4),
		stdinDone: make(chan struct{}),
		detached:  false,
		detachGen: 2,
	}
	sess.creditCond = sync.NewCond(&sess.mu)
	srv := NewServer(Config{Enabled: true})
	srv.sessions[sess.sid] = sess

	// Stale generation 1 timer fires after session already resumed to gen 2
	srv.terminateSessionIfDetached(sess, 1, proto.CloseDetachExpired)
	if sess.closed || pty.killed {
		t.Fatal("stale graceTimer killed a resumed session (G-H6)")
	}
	srv.ShutdownAll(proto.CloseServerStop)
	if !sess.closed || !pty.killed {
		t.Fatal("ShutdownAll did not terminate session cleanly (G-M2)")
	}
}
