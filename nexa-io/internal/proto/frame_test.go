package proto

import (
	"bytes"
	"encoding/hex"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestGoldenLogRecordEncodingAndDecoding(t *testing.T) {
	// Golden vector shared between Go (server) and Kotlin (Android client):
	// prio=6 (INFO), unit_id=0 (nexa-server), cat_flags=0x01 (FINANCE),
	// timestamp_ms=1763620502000 (0x0000019aa09a29f0),
	// message="Mutasi rekening [ACC-****] Rp500.000 berhasil" (45 bytes)
	rec := LogRecord{
		Prio:        PrioInfo,
		UnitID:      UnitNexaServer,
		CatFlags:    CatFinance,
		TimestampMs: 1763620502000,
		Message:     "Mutasi rekening [ACC-****] Rp500.000 berhasil",
	}

	encoded := EncodeLogRecord(rec)
	if len(encoded) != 13+45 {
		t.Fatalf("expected 58 bytes, got %d", len(encoded))
	}

	expectedHeaderHex := "0600010000019a9ff939f0002d"
	actualHeaderHex := hex.EncodeToString(encoded[:13])
	if actualHeaderHex != expectedHeaderHex {
		t.Fatalf("golden header mismatch: got %s, want %s", actualHeaderHex, expectedHeaderHex)
	}

	// Pack two records into a single DATA frame on channel 0x03
	rec2 := LogRecord{
		Prio:        PrioWarn,
		UnitID:      UnitNexaIO,
		CatFlags:    CatSynthetic,
		TimestampMs: 1763620460000,
		Message:     "--- 42 baris dilewati karena lonjakan data ---",
	}
	combinedPayload := append(append([]byte{}, encoded...), EncodeLogRecord(rec2)...)
	frame, err := EncodeFrame(ChLogs, OpData, combinedPayload)
	if err != nil {
		t.Fatalf("EncodeFrame failed: %v", err)
	}

	ch, op, payload, err := DecodeFrame(frame)
	if err != nil {
		t.Fatalf("DecodeFrame failed: %v", err)
	}
	if ch != ChLogs || op != OpData {
		t.Fatalf("unexpected ch/op: %d/%d", ch, op)
	}

	decoded, err := DecodeLogRecords(payload)
	if err != nil {
		t.Fatalf("DecodeLogRecords failed: %v", err)
	}
	if len(decoded) != 2 {
		t.Fatalf("expected 2 records, got %d", len(decoded))
	}
	if decoded[0] != rec || decoded[1] != rec2 {
		t.Fatalf("decoded records mismatch: %+v", decoded)
	}
}

func TestCategoryPrefixParsingAndUTF8Truncation(t *testing.T) {
	cat, clean := ParseCategoryPrefix("<6>[cat=FINANCE] Mutasi rekening [ACC-****] Rp500.000 berhasil")
	if cat != CatFinance {
		t.Fatalf("expected CatFinance (0x01), got 0x%02x", cat)
	}
	if clean != "Mutasi rekening [ACC-****] Rp500.000 berhasil" {
		t.Fatalf("unexpected clean message: %q", clean)
	}

	catNone, cleanNone := ParseCategoryPrefix("Respons lambat 412 ms pada rute /ws")
	if catNone != 0 || cleanNone != "Respons lambat 412 ms pada rute /ws" {
		t.Fatalf("unexpected non-prefixed parse: %d %q", catNone, cleanNone)
	}

	// Build a multi-byte UTF-8 string > 2048 bytes with 3-byte bullet runes ('•')
	longText := strings.Repeat("•", 900) // 2700 bytes
	truncated := TruncateUTF8Message(longText, MaxLogMessageBytes)
	if !utf8.ValidString(truncated) {
		t.Fatal("truncated string is not valid UTF-8")
	}
	if !strings.HasSuffix(truncated, TruncatedSuffix) {
		t.Fatalf("expected %s suffix", TruncatedSuffix)
	}
	if len(truncated) > MaxLogMessageBytes {
		t.Fatalf("total truncated length %d exceeds MaxLogMessageBytes %d (G-H10)", len(truncated), MaxLogMessageBytes)
	}

	// G-H10: Invalid UTF-8 bytes must be sanitized in O(N) without blowing up or returning invalid UTF-8
	invalidMsg := string([]byte{0xFF, 0xFE}) + strings.Repeat("A", 2500)
	sanitized := TruncateUTF8Message(invalidMsg, MaxLogMessageBytes)
	if !utf8.ValidString(sanitized) || len(sanitized) > MaxLogMessageBytes {
		t.Fatalf("invalid UTF-8 sanitization failed: valid=%v len=%d", utf8.ValidString(sanitized), len(sanitized))
	}

	// G-M3: Untrusted log text must NOT be able to forge [cat=SYNTHETIC]
	forgedCat, _ := ParseCategoryPrefix("[cat=SYNTHETIC] fake overflow banner")
	if (forgedCat & CatSynthetic) != 0 {
		t.Fatalf("ParseCategoryPrefix allowed forged CatSynthetic flag: 0x%02x", forgedCat)
	}

	// G-C2: StripPM2Timestamp removes PM2 timestamp before [cat=FINANCE]
	stripped := StripPM2Timestamp("2026-11-20 14:22:01: [cat=FINANCE] Mutasi Rp500.000")
	pm2Cat, pm2Clean := ParseCategoryPrefix(stripped)
	if pm2Cat != CatFinance || pm2Clean != "Mutasi Rp500.000" {
		t.Fatalf("StripPM2Timestamp + ParseCategoryPrefix failed: cat=0x%02x msg=%q", pm2Cat, pm2Clean)
	}

	// G-M6: EncodeErrFrame truncates multibyte UTF-8 cleanly <= 512 bytes
	longErr := EncodeErrFrame(ChLogs, ErrInvalidFrame, strings.Repeat("é", 400))
	if !utf8.Valid(longErr[3:]) || len(longErr[3:]) > 512 {
		t.Fatalf("EncodeErrFrame produced invalid/oversized UTF-8: len=%d valid=%v", len(longErr[3:]), utf8.Valid(longErr[3:]))
	}

	// L1: Full 3-segment JWT and ?ticket= query string redaction
	redacted := RedactSafetyNet("GET /io/logs?ticket=secret123 jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c")
	if strings.Contains(redacted, "secret123") || strings.Contains(redacted, "SflKxwRJSMeKKF") {
		t.Fatalf("L1 redaction leaked query ticket or 3rd JWT segment: %s", redacted)
	}
}

func TestOpenAndCreditPayloadsAndFilterMatching(t *testing.T) {
	open := LogOpenParams{
		UnitMask:  0x0F,
		MinPrio:   PrioInfo,
		CatMask:   CatFinance,
		TailLines: 100,
	}
	rawOpen := EncodeLogOpen(open)
	if !bytes.Equal(rawOpen, []byte{0x0F, 0x06, 0x01, 0x00, 0x64}) {
		t.Fatalf("unexpected OPEN bytes: %v", rawOpen)
	}
	parsedOpen, err := DecodeLogOpen(rawOpen)
	if err != nil || parsedOpen != open {
		t.Fatalf("DecodeLogOpen mismatch: %+v %v", parsedOpen, err)
	}

	rawCredit := EncodeCredit(32768)
	creditVal, err := DecodeCredit(rawCredit)
	if err != nil || creditVal != 32768 {
		t.Fatalf("DecodeCredit mismatch: %d %v", creditVal, err)
	}

	finRec := LogRecord{Prio: PrioInfo, UnitID: UnitNexaServer, CatFlags: CatFinance}
	bridgeRec := LogRecord{Prio: PrioInfo, UnitID: UnitNexaServer, CatFlags: CatBridge}
	synthRec := LogRecord{Prio: PrioWarn, UnitID: UnitNexaIO, CatFlags: CatSynthetic}

	if !MatchesFilter(finRec, open) {
		t.Fatal("expected finRec to match FINANCE filter")
	}
	if MatchesFilter(bridgeRec, open) {
		t.Fatal("expected bridgeRec to be rejected by FINANCE filter")
	}
	if !MatchesFilter(synthRec, open) {
		t.Fatal("expected synthetic overflow record to always pass filter")
	}
}
