package logstream

import (
	"bufio"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"nexa-io/internal/proto"
	"nexa-io/internal/ticket"
)

func issueTestTicket(t *testing.T, priv ed25519.PrivateKey, scope, jti string) string {
	t.Helper()
	payload, err := json.Marshal(ticket.Claims{
		Scope: scope,
		SID:   "",
		Exp:   time.Now().Add(45 * time.Second).Unix(),
		JTI:   jti,
		Dev:   "samsung-a33-tuan",
	})
	if err != nil {
		t.Fatal(err)
	}
	sig := ed25519.Sign(priv, payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

// writeMaskedClientFrame writes a masked RFC 6455 binary frame from test client to server.
func writeMaskedClientFrame(w io.Writer, payload []byte) error {
	maskKey := [4]byte{0x12, 0x34, 0x56, 0x78}
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

// readUnmaskedServerFrame reads an unmasked RFC 6455 binary frame from server in tests.
func readUnmaskedServerFrame(r *bufio.Reader) ([]byte, error) {
	var hdr [2]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return nil, err
	}
	length := int(hdr[1] & 0x7F)
	switch length {
	case 126:
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

func TestTicketEnforcementAndForbiddenQueryString(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	v, err := ticket.NewVerifier(pub)
	if err != nil {
		t.Fatal(err)
	}

	srv := NewServer(Config{Verifier: v})
	ts := httptest.NewServer(srv)
	defer ts.Close()

	// 1. Missing ticket -> 401
	resp1, err := http.Get(ts.URL + "/io/logs")
	if err != nil {
		t.Fatal(err)
	}
	resp1.Body.Close()
	if resp1.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing ticket, got %d", resp1.StatusCode)
	}

	// 2. Ticket in query string (FR-SEC-01 violation) -> 401
	validTkt := issueTestTicket(t, priv, "logs", "jti-q-1")
	resp2, err := http.Get(ts.URL + "/io/logs?ticket=" + validTkt)
	if err != nil {
		t.Fatal(err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for query string ticket, got %d", resp2.StatusCode)
	}

	// 3. Wrong scope (term ticket used on /io/logs) -> 401
	termTkt := issueTestTicket(t, priv, "term", "jti-term-1")
	req3, _ := http.NewRequest("GET", ts.URL+"/io/logs", nil)
	req3.Header.Set("Authorization", "Bearer "+termTkt)
	resp3, err := http.DefaultClient.Do(req3)
	if err != nil {
		t.Fatal(err)
	}
	resp3.Body.Close()
	if resp3.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong scope, got %d", resp3.StatusCode)
	}
}

func TestWebSocketLogStreamingFilterAndSpikeOverflow(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	v, err := ticket.NewVerifier(pub)
	if err != nil {
		t.Fatal(err)
	}

	producer := func(ctx context.Context, params proto.LogOpenParams, out chan<- proto.LogRecord) error {
		// Emit 45 FINANCE records and 10 BRIDGE records in a burst
		for i := 1; i <= 45; i++ {
			select {
			case <-ctx.Done():
				return nil
			case out <- proto.LogRecord{
				Prio:        proto.PrioInfo,
				UnitID:      proto.UnitNexaServer,
				CatFlags:    proto.CatFinance,
				TimestampMs: uint64(1763620000000 + i),
				Message:     fmt.Sprintf("Mutasi FINANCE #%d", i),
			}:
			}
		}
		for i := 1; i <= 10; i++ {
			select {
			case <-ctx.Done():
				return nil
			case out <- proto.LogRecord{
				Prio:        proto.PrioInfo,
				UnitID:      proto.UnitNexaServer,
				CatFlags:    proto.CatBridge,
				TimestampMs: uint64(1763620001000 + i),
				Message:     fmt.Sprintf("Status BRIDGE #%d", i),
			}:
			}
		}
		return nil
	}

	srv := NewServer(Config{
		Verifier:      v,
		Producer:      producer,
		BatchInterval: 30 * time.Millisecond,
	})
	ts := httptest.NewServer(srv)
	defer ts.Close()

	tkt := issueTestTicket(t, priv, "logs", "jti-stream-1")
	addr := strings.TrimPrefix(ts.URL, "http://")
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// Perform RFC 6455 upgrade with Authorization: Bearer header
	handshake := "GET /io/logs HTTP/1.1\r\n" +
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
	// Drain remaining HTTP response headers
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}

	// Send OPEN frame subscribing ONLY to CatFinance (0x01)
	openPayload := proto.EncodeLogOpen(proto.LogOpenParams{
		UnitMask:  0x0F,
		MinPrio:   proto.PrioDebug,
		CatMask:   proto.CatFinance,
		TailLines: 50,
	})
	openFrame, _ := proto.EncodeFrame(proto.ChLogs, proto.OpOpen, openPayload)
	if err := writeMaskedClientFrame(conn, openFrame); err != nil {
		t.Fatal(err)
	}

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	rawDataFrame, err := readUnmaskedServerFrame(br)
	if err != nil {
		t.Fatalf("failed reading batched DATA frame: %v", err)
	}

	ch, op, dataPayload, err := proto.DecodeFrame(rawDataFrame)
	if err != nil || ch != proto.ChLogs || op != proto.OpData {
		t.Fatalf("unexpected frame: ch=%d op=%d err=%v", ch, op, err)
	}

	records, err := proto.DecodeLogRecords(dataPayload)
	if err != nil {
		t.Fatalf("DecodeLogRecords failed: %v", err)
	}
	if len(records) == 0 || len(records) > MaxLinesPerBatch {
		t.Fatalf("expected 1..%d batched records, got %d", MaxLinesPerBatch, len(records))
	}

	for _, r := range records {
		if (r.CatFlags&proto.CatFinance) == 0 && (r.CatFlags&proto.CatSynthetic) == 0 {
			t.Fatalf("received non-FINANCE record under FINANCE filter: %+v", r)
		}
	}
}

func TestJournalByteArrayAndUnitWhitelistEnforcement(t *testing.T) {
	// G-C6: journalctl -o json encodes MESSAGE with ANSI escape bytes as JSON int array
	rawBytesJSON := `{"MESSAGE":[27,91,51,49,109,91,99,97,116,61,65,85,84,72,93,32,69,82,82],"PRIORITY":"3","_SYSTEMD_UNIT":"nexa-server.service","__REALTIME_TIMESTAMP":"1763620502000000"}`
	rec, ok := parseJournalJSONLine([]byte(rawBytesJSON))
	if !ok {
		t.Fatal("expected parseJournalJSONLine to accept byte-array MESSAGE (G-C6)")
	}
	if rec.UnitID != proto.UnitNexaServer || rec.Prio != proto.PrioError {
		t.Fatalf("unexpected parsed record: %+v", rec)
	}

	// G-C7: Non-whitelisted unit (e.g. sshd.service) MUST be rejected
	sshdJSON := `{"MESSAGE":"Accepted publickey for root","PRIORITY":"6","_SYSTEMD_UNIT":"sshd.service","SYSLOG_IDENTIFIER":"sshd"}`
	if _, allowed := parseJournalJSONLine([]byte(sshdJSON)); allowed {
		t.Fatal("expected sshd.service to be rejected by FR-LOG-02 whitelist (G-C7)")
	}

	// H5: Sysstat / unrelated PID 1 lifecycle events MUST be rejected (eliminates sysstat-collect.service flood)
	sysstatJSON := `{"MESSAGE":"Started sysstat-collect.service","PRIORITY":"6","_PID":"1","SYSLOG_IDENTIFIER":"systemd","UNIT":"sysstat-collect.service"}`
	if _, allowed := parseJournalJSONLine([]byte(sysstatJSON)); allowed {
		t.Fatal("expected sysstat-collect.service PID 1 event to be rejected (H5)")
	}

	// H5: Spoofed SYSLOG_IDENTIFIER=nexa-server from another unit MUST be rejected or mapped to its real _SYSTEMD_UNIT
	spoofJSON := `{"MESSAGE":"Fake log from term","PRIORITY":"6","_SYSTEMD_UNIT":"nexa-term.service","SYSLOG_IDENTIFIER":"nexa-server"}`
	spoofRec, spoofOK := parseJournalJSONLine([]byte(spoofJSON))
	if !spoofOK || spoofRec.UnitID != proto.UnitNexaIO {
		t.Fatalf("expected _SYSTEMD_UNIT=nexa-term.service to override spoofed SYSLOG_IDENTIFIER, got ok=%v rec=%+v", spoofOK, spoofRec)
	}
	spoofEvilJSON := `{"MESSAGE":"Fake log from cron","PRIORITY":"6","_SYSTEMD_UNIT":"cron.service","SYSLOG_IDENTIFIER":"nexa-server"}`
	if _, allowed := parseJournalJSONLine([]byte(spoofEvilJSON)); allowed {
		t.Fatal("expected cron.service with spoofed SYSLOG_IDENTIFIER=nexa-server to be rejected (H5)")
	}

	// H5: PID 1 lifecycle event for whitelisted nexa-log.service MUST be accepted as UnitSystemd
	nexaPid1JSON := `{"MESSAGE":"Started nexa-log.service","PRIORITY":"6","_PID":"1","SYSLOG_IDENTIFIER":"systemd","UNIT":"nexa-log.service"}`
	pid1Rec, pid1OK := parseJournalJSONLine([]byte(nexaPid1JSON))
	if !pid1OK || pid1Rec.UnitID != proto.UnitSystemd {
		t.Fatalf("expected whitelisted PID 1 event for nexa-log.service to be accepted as UnitSystemd, got ok=%v rec=%+v", pid1OK, pid1Rec)
	}

	// G-C7 / H5: Selecting ONLY UnitSystemd (bit 2 = 0x04) MUST generate explicit kernel + scoped PID 1 UNIT args
	args := buildJournalctlArgs(proto.LogOpenParams{UnitMask: 1 << proto.UnitSystemd, TailLines: 20})
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--no-pager") || !strings.Contains(joined, "_TRANSPORT=kernel") || !strings.Contains(joined, "UNIT=nexa-server.service") {
		t.Fatalf("UnitSystemd journalctl args missing explicit kernel/scoped UNIT clauses: %v", args)
	}
	if strings.Contains(joined, "SYSLOG_IDENTIFIER=systemd") {
		t.Fatalf("UnitSystemd journalctl args must not use unscoped SYSLOG_IDENTIFIER=systemd: %v", args)
	}

	// L1: Leading ANSI escape before [cat=AUTH] is parsed cleanly into CatAuth
	if (rec.CatFlags & proto.CatAuth) == 0 {
		t.Fatalf("expected leading ANSI + [cat=AUTH] to parse CatAuth flag, got 0x%02x (msg=%q)", rec.CatFlags, rec.Message)
	}

	// G-L1: Nil verifier must fail closed with 500
	nilSrv := NewServer(Config{Verifier: nil})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/io/logs", nil)
	req.Header.Set("Authorization", "Bearer anything")
	nilSrv.ServeHTTP(rr, req)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 fail-closed when Verifier is nil, got %d", rr.Code)
	}
}

func TestPM2PriorityPreservationDeepTailAndJournalctlFilterArgs(t *testing.T) {
	// 1. WARN line (<4>) inside PM2 err.log MUST stay PrioWarn (4), never promoted to ERROR (3)
	warnRec := parsePM2Line("<4>[cat=FINANCE] [FINANCE] Recovery resend failed", proto.PrioError)
	if warnRec.Prio != proto.PrioWarn {
		t.Fatalf("expected WARN <4> in err.log to preserve PrioWarn (4), got %d", warnRec.Prio)
	}
	if (warnRec.CatFlags & proto.CatFinance) == 0 {
		t.Fatalf("expected CatFinance flag on warnRec, got 0x%02x", warnRec.CatFlags)
	}
	errorsOnlyFilter := proto.LogOpenParams{UnitMask: 0x0F, MinPrio: proto.PrioError, CatMask: 0}
	if proto.MatchesFilter(warnRec, errorsOnlyFilter) {
		t.Fatal("WARN <4> record must NOT match ERRORS ONLY filter")
	}

	// 2. Multi-tag Finance Step-Up ERROR (<3>[cat=FINANCE][cat=AUTH]) matches BOTH FINANCE and ERRORS ONLY
	stepUpErr := parsePM2Line("<3>[cat=FINANCE][cat=AUTH] [NEXA-AUTH] ACTION_REJECTED amount=500000", proto.PrioError)
	if stepUpErr.Prio != proto.PrioError || stepUpErr.CatFlags != (proto.CatFinance|proto.CatAuth) {
		t.Fatalf("unexpected stepUpErr parsed record: %+v", stepUpErr)
	}
	financeFilter := proto.LogOpenParams{UnitMask: 0x0F, MinPrio: proto.PrioDebug, CatMask: proto.CatFinance}
	if !proto.MatchesFilter(stepUpErr, financeFilter) || !proto.MatchesFilter(stepUpErr, errorsOnlyFilter) {
		t.Fatal("multi-tag finance step-up error must match both FINANCE and ERRORS ONLY")
	}

	// 3. Benign INFO line mentioning "errorCount=0" in out.log must NOT become ERROR
	benignInfo := parsePM2Line("<6>[cat=BRIDGE] [WS-GATEWAY] health ok errorCount=0", proto.PrioInfo)
	if benignInfo.Prio != proto.PrioInfo {
		t.Fatalf("expected benign INFO <6> with errorCount=0 to remain PrioInfo, got %d", benignInfo.Prio)
	}

	// 4. journalctl args add -p 3 for ERRORS ONLY and deeper -n >= 1000 for category filter
	errArgs := strings.Join(buildJournalctlArgs(proto.LogOpenParams{UnitMask: 0x0F, MinPrio: proto.PrioError, TailLines: 100}), " ")
	if !strings.Contains(errArgs, "-p 3") {
		t.Fatalf("expected -p 3 in journalctl args for ERRORS ONLY, got: %s", errArgs)
	}
	finArgs := strings.Join(buildJournalctlArgs(proto.LogOpenParams{UnitMask: 0x0F, MinPrio: proto.PrioDebug, CatMask: proto.CatFinance, TailLines: 100}), " ")
	if !strings.Contains(finArgs, "-n 1000") {
		t.Fatalf("expected widened -n 1000 in journalctl args for FINANCE filter, got: %s", finArgs)
	}

	// 5. tailPM2File finds historical FINANCE lines buried behind 150 routine INFO lines
	tmpFile := filepath.Join(t.TempDir(), "out.log")
	var sb strings.Builder
	sb.WriteString("<6>[cat=FINANCE] [SUPABASE_FINANCE] Mutasi Rp350.000 berhasil #1\n")
	sb.WriteString("<6>[cat=FINANCE] [BUDGET_ENGINE] Alert anggaran harian #2\n")
	for i := 0; i < 150; i++ {
		sb.WriteString(fmt.Sprintf("<6>[cat=BRIDGE] [WS-GATEWAY] Heartbeat ping #%d\n", i))
	}
	if err := os.WriteFile(tmpFile, []byte(sb.String()), 0600); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	out := make(chan proto.LogRecord, 16)
	done := make(chan struct{})
	go func() {
		defer close(done)
		tailPM2File(ctx, tmpFile, proto.PrioInfo, proto.LogOpenParams{
			UnitMask:  0x0F,
			MinPrio:   proto.PrioDebug,
			CatMask:   proto.CatFinance,
			TailLines: 50,
		}, out)
	}()

	var got []proto.LogRecord
	for len(got) < 2 {
		select {
		case rec := <-out:
			got = append(got, rec)
		case <-ctx.Done():
			<-done
			t.Fatalf("timed out waiting for buried FINANCE lines; got only %d", len(got))
		}
	}
	cancel()
	<-done
	if len(got) != 2 || !strings.Contains(got[0].Message, "#1") || !strings.Contains(got[1].Message, "#2") {
		t.Fatalf("unexpected filtered PM2 tail records: %+v", got)
	}
}

func TestAllFilterInitialTailPreservesInfoAndErrorsDeterministically(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	v, err := ticket.NewVerifier(pub)
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	outPath := filepath.Join(dir, "out.log")
	errPath := filepath.Join(dir, "err.log")

	var outSB, errSB strings.Builder
	for i := 0; i < 120; i++ {
		outSB.WriteString(fmt.Sprintf("<6>[cat=CORE] [NEXA] Normal operational log #%03d\n", i))
	}
	for i := 0; i < 47; i++ {
		errSB.WriteString(fmt.Sprintf("<4>[cat=CORE] [FALLBACK] Warn 503 #%02d\n", i))
	}
	if err := os.WriteFile(errPath, []byte(errSB.String()), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outPath, []byte(outSB.String()), 0600); err != nil {
		t.Fatal(err)
	}
	// Make err.log explicitly older than out.log (mirroring real VPS state)
	older := time.Now().Add(-5 * time.Minute)
	newer := time.Now()
	if err := os.Chtimes(errPath, older, older); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(outPath, newer, newer); err != nil {
		t.Fatal(err)
	}

	srv := NewServer(Config{
		Verifier:      v,
		BatchInterval: 25 * time.Millisecond,
		PM2OutLogPath: outPath,
		PM2ErrLogPath: errPath,
	})
	ts := httptest.NewServer(srv)
	defer ts.Close()

	tkt := issueTestTicket(t, priv, "logs", "jti-all-tail-1")
	addr := strings.TrimPrefix(ts.URL, "http://")
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	handshake := "GET /io/logs HTTP/1.1\r\n" +
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
		t.Fatalf("expected 101, got %q (%v)", statusLine, err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}

	openPayload := proto.EncodeLogOpen(proto.LogOpenParams{
		UnitMask:  1 << proto.UnitNexaServer,
		MinPrio:   proto.PrioDebug,
		CatMask:   0,
		TailLines: 100,
	})
	openFrame, _ := proto.EncodeFrame(proto.ChLogs, proto.OpOpen, openPayload)
	if err := writeMaskedClientFrame(conn, openFrame); err != nil {
		t.Fatal(err)
	}

	_ = conn.SetReadDeadline(time.Now().Add(450 * time.Millisecond))
	var received []proto.LogRecord
	for {
		frame, err := readUnmaskedServerFrame(br)
		if err != nil {
			break
		}
		ch, op, payload, err := proto.DecodeFrame(frame)
		if err != nil || ch != proto.ChLogs || op != proto.OpData {
			continue
		}
		recs, err := proto.DecodeLogRecords(payload)
		if err != nil {
			t.Fatalf("DecodeLogRecords failed: %v", err)
		}
		if len(recs) > MaxLinesPerBatch {
			t.Fatalf("batch exceeded MaxLinesPerBatch (%d): got %d", MaxLinesPerBatch, len(recs))
		}
		received = append(received, recs...)
	}

	infoCount, warnCount, synthCount := 0, 0, 0
	for _, r := range received {
		switch {
		case (r.CatFlags & proto.CatSynthetic) != 0:
			synthCount++
		case r.Prio <= proto.PrioWarn:
			warnCount++
		default:
			infoCount++
		}
	}
	if synthCount != 0 {
		t.Fatalf("expected 0 synthetic overflow banners on normal initial tail, got %d (total=%d info=%d warn=%d)", synthCount, len(received), infoCount, warnCount)
	}
	if infoCount < 90 || warnCount == 0 {
		t.Fatalf("expected both INFO (>=90) and WARN (>0) on ALL initial tail, got info=%d warn=%d total=%d", infoCount, warnCount, len(received))
	}
	last := received[len(received)-1]
	if last.Prio != proto.PrioInfo || !strings.Contains(last.Message, "#119") {
		t.Fatalf("expected newest tail record to be latest out.log INFO (#119), got prio=%d msg=%q", last.Prio, last.Message)
	}
}
