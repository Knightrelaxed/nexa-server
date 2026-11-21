// Package proto implements the Connection B binary framing protocol (§10.1-10.3)
// shared by nexa-log (/io/logs) and nexa-term (/io/term).
// All integers are big-endian. Maximum hot-path frame payload is 4 KiB.
package proto

import (
	"encoding/binary"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	// Channel IDs (PRD §10.1)
	ChControl   uint8 = 0x00
	ChTelemetry uint8 = 0x01
	ChChat      uint8 = 0x02
	ChLogs      uint8 = 0x03
	ChTermMin   uint8 = 0x10
	ChTermMax   uint8 = 0xFF

	// Opcodes (PRD §10.1)
	OpOpen   uint8 = 0x01
	OpData   uint8 = 0x02
	OpCredit uint8 = 0x03
	OpClose  uint8 = 0x04
	OpResize uint8 = 0x05
	OpErr    uint8 = 0x06
	OpPing   uint8 = 0x07
	OpPong   uint8 = 0x08
	OpResume uint8 = 0x09

	// CLOSE reason codes (PRD §10.2)
	CloseNormal        uint8 = 0
	CloseClientExit    uint8 = 1
	CloseIdle          uint8 = 2
	CloseSessionLimit  uint8 = 3
	CloseAuth          uint8 = 4
	CloseServerStop    uint8 = 5
	CloseDetachExpired uint8 = 6

	// ERR codes (PRD §10.2)
	ErrInvalidFrame  uint8 = 1
	ErrUnauthorized  uint8 = 2
	ErrForbiddenUnit uint8 = 3
	ErrRateLimited   uint8 = 4
	ErrFeatureOff    uint8 = 5
	ErrResourceLimit uint8 = 6
	ErrResumeFailed  uint8 = 7

	// Log Unit IDs (PRD §10.3)
	UnitNexaServer uint8 = 0x00
	UnitCaddy      uint8 = 0x01
	UnitSystemd    uint8 = 0x02
	UnitNexaIO     uint8 = 0x03
	AllowedUnitMask uint8 = 0x0F

	// Log Priority RFC 5424 (PRD §10.3)
	PrioError uint8 = 3
	PrioWarn  uint8 = 4
	PrioInfo  uint8 = 6
	PrioDebug uint8 = 7

	// Log Category Bitmask Flags (PRD §10.3)
	CatNone      uint8 = 0x00
	CatFinance   uint8 = 0x01
	CatBridge    uint8 = 0x02
	CatAuth      uint8 = 0x04
	CatSynthetic uint8 = 0x80

	// Limits (PRD §10.1, §10.3)
	MaxFramePayloadBytes = 4096
	LogRecordHeaderBytes = 13
	MaxLogMessageBytes   = 2048
	TruncatedSuffix      = "[TRUNCATED]" // 11 bytes
	InitialLogCredit     = 32 * 1024     // 32 KiB
	InitialTermCredit    = 64 * 1024     // 64 KiB (FR-TERM-10)
	TermReplayRingBytes  = 64 * 1024     // 64 KiB replay ring (FR-TERM-11)
)

var (
	ErrFrameTooShort   = errors.New("binary frame shorter than 2-byte header")
	ErrPayloadTooLarge = errors.New("binary frame payload exceeds 4 KiB limit")
	ErrMalformedOpen   = errors.New("malformed OPEN payload")
	ErrMalformedCredit = errors.New("malformed CREDIT payload")
	ErrMalformedResize = errors.New("malformed RESIZE payload")
	ErrMalformedResume = errors.New("malformed RESUME payload")
	ErrMalformedRecord = errors.New("malformed 13-byte log record")
)

var tokenSafetyRegex = regexp.MustCompile(`(?i)(Bearer\s+[A-Za-z0-9._~+/=-]{12,}|AIza[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z_-]{16,}|sk-(?:proj-|ant-|live-|test-)?[0-9A-Za-z_-]{16,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{12,})?|[?&](?:ticket|token)=[^\s&"'<>]+)`)
var pm2TimestampRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?:?\s+`)
var leadingAnsiRegex = regexp.MustCompile(`^(?:\x1b\[[0-9;?]*[ -/]*[@-~]\s*)+`)

// EncodeFrame packs [ch: u8][op: u8][payload: N bytes].
func EncodeFrame(ch, op uint8, payload []byte) ([]byte, error) {
	if len(payload) > MaxFramePayloadBytes {
		return nil, ErrPayloadTooLarge
	}
	out := make([]byte, 2+len(payload))
	out[0] = ch
	out[1] = op
	copy(out[2:], payload)
	return out, nil
}

// DecodeFrame unpacks [ch: u8][op: u8][payload: N bytes].
func DecodeFrame(raw []byte) (uint8, uint8, []byte, error) {
	if len(raw) < 2 {
		return 0, 0, nil, ErrFrameTooShort
	}
	if len(raw)-2 > MaxFramePayloadBytes {
		return 0, 0, nil, ErrPayloadTooLarge
	}
	return raw[0], raw[1], raw[2:], nil
}

// LogOpenParams represents the 5-byte OPEN payload for channel 0x03 (LOGS).
type LogOpenParams struct {
	UnitMask  uint8
	MinPrio   uint8
	CatMask   uint8
	TailLines uint16
}

// EncodeLogOpen encodes [unit_mask: u8][min_prio: u8][cat_mask: u8][tail: u16 big-endian].
func EncodeLogOpen(p LogOpenParams) []byte {
	buf := make([]byte, 5)
	buf[0] = p.UnitMask
	buf[1] = p.MinPrio
	buf[2] = p.CatMask
	binary.BigEndian.PutUint16(buf[3:5], p.TailLines)
	return buf
}

// DecodeLogOpen decodes the 5-byte OPEN payload for channel 0x03.
func DecodeLogOpen(payload []byte) (LogOpenParams, error) {
	if len(payload) != 5 {
		return LogOpenParams{}, ErrMalformedOpen
	}
	return LogOpenParams{
		UnitMask:  payload[0],
		MinPrio:   payload[1],
		CatMask:   payload[2],
		TailLines: binary.BigEndian.Uint16(payload[3:5]),
	}, nil
}

// EncodeCredit encodes [bytes: u32 big-endian].
func EncodeCredit(bytes uint32) []byte {
	buf := make([]byte, 4)
	binary.BigEndian.PutUint32(buf, bytes)
	return buf
}

// DecodeCredit decodes [bytes: u32 big-endian].
func DecodeCredit(payload []byte) (uint32, error) {
	if len(payload) != 4 {
		return 0, ErrMalformedCredit
	}
	return binary.BigEndian.Uint32(payload), nil
}

// TermOpenParams represents the OPEN payload for a terminal channel (0x10..0xFF):
// [rows: u16 BE][cols: u16 BE] (4 bytes) or with optional [sid: 16 bytes] (20 bytes, PRD §10.2).
type TermOpenParams struct {
	Rows uint16
	Cols uint16
	SID  [16]byte
	HasSID bool
}

// EncodeTermOpen encodes [rows: u16 BE][cols: u16 BE][sid: 16 bytes].
func EncodeTermOpen(rows, cols uint16, sid [16]byte) []byte {
	buf := make([]byte, 20)
	binary.BigEndian.PutUint16(buf[0:2], rows)
	binary.BigEndian.PutUint16(buf[2:4], cols)
	copy(buf[4:20], sid[:])
	return buf
}

// DecodeTermOpen decodes a 4-byte or 20-byte terminal OPEN payload.
func DecodeTermOpen(payload []byte) (TermOpenParams, error) {
	if len(payload) != 4 && len(payload) != 20 {
		return TermOpenParams{}, ErrMalformedOpen
	}
	out := TermOpenParams{
		Rows: binary.BigEndian.Uint16(payload[0:2]),
		Cols: binary.BigEndian.Uint16(payload[2:4]),
	}
	if len(payload) == 20 {
		copy(out.SID[:], payload[4:20])
		out.HasSID = true
	}
	return out, nil
}

// EncodeTermResize encodes [rows: u16 BE][cols: u16 BE].
func EncodeTermResize(rows, cols uint16) []byte {
	buf := make([]byte, 4)
	binary.BigEndian.PutUint16(buf[0:2], rows)
	binary.BigEndian.PutUint16(buf[2:4], cols)
	return buf
}

// DecodeTermResize decodes [rows: u16 BE][cols: u16 BE].
func DecodeTermResize(payload []byte) (uint16, uint16, error) {
	if len(payload) != 4 {
		return 0, 0, ErrMalformedResize
	}
	return binary.BigEndian.Uint16(payload[0:2]), binary.BigEndian.Uint16(payload[2:4]), nil
}

// TermResumeParams represents the 24-byte terminal RESUME payload (PRD §10.2):
// [sid: 16 bytes][received_offset: u64 BE]
type TermResumeParams struct {
	SID            [16]byte
	ReceivedOffset uint64
}

// EncodeTermResume encodes [sid: 16 bytes][received_offset: u64 BE].
func EncodeTermResume(sid [16]byte, receivedOffset uint64) []byte {
	buf := make([]byte, 24)
	copy(buf[0:16], sid[:])
	binary.BigEndian.PutUint64(buf[16:24], receivedOffset)
	return buf
}

// DecodeTermResume decodes [sid: 16 bytes][received_offset: u64 BE].
func DecodeTermResume(payload []byte) (TermResumeParams, error) {
	if len(payload) != 24 {
		return TermResumeParams{}, ErrMalformedResume
	}
	var out TermResumeParams
	copy(out.SID[:], payload[0:16])
	out.ReceivedOffset = binary.BigEndian.Uint64(payload[16:24])
	return out, nil
}

// EncodeErrFrame encodes an ERR frame [ch][OpErr][code: u8][message: UTF-8].
// G-M6: Truncates at a valid UTF-8 boundary (<= 512 bytes) without splitting runes.
func EncodeErrFrame(ch, code uint8, msg string) []byte {
	clean := strings.ToValidUTF8(msg, "\uFFFD")
	if len(clean) > 512 {
		cut := 512
		for cut > 0 && !utf8.RuneStart(clean[cut]) {
			cut--
		}
		clean = clean[:cut]
	}
	msgBytes := []byte(clean)
	out := make([]byte, 3+len(msgBytes))
	out[0] = ch
	out[1] = OpErr
	out[2] = code
	copy(out[3:], msgBytes)
	return out
}

// EncodeCloseFrame encodes a CLOSE frame [ch][OpClose][reason: u8].
func EncodeCloseFrame(ch, reason uint8) []byte {
	return []byte{ch, OpClose, reason}
}

// LogRecord represents a structured log entry (PRD §10.3).
type LogRecord struct {
	Prio        uint8
	UnitID      uint8
	CatFlags    uint8
	TimestampMs uint64
	Message     string
}

// StripPM2Timestamp strips an optional PM2 log_date_format prefix before [cat=...] parsing (G-C2).
func StripPM2Timestamp(raw string) string {
	trimmed := strings.TrimLeft(raw, " \t")
	return pm2TimestampRegex.ReplaceAllString(trimmed, "")
}

// ParseSyslogPriorityAndCategory extracts an optional RFC 5424 <N> priority prefix (0..7)
// and strips leading ANSI CSI codes and [cat=FINANCE|BRIDGE|AUTH] tags (FR-LOG-08, L1).
// G-M3: SYNTHETIC cannot be injected from untrusted log text; only the sidecar sets CatSynthetic.
func ParseSyslogPriorityAndCategory(raw string) (uint8, bool, uint8, string) {
	trimmed := strings.TrimLeft(raw, " \t")
	trimmed = leadingAnsiRegex.ReplaceAllString(trimmed, "")
	var prio uint8
	hasPrio := false
	if len(trimmed) >= 3 && trimmed[0] == '<' && trimmed[2] == '>' && trimmed[1] >= '0' && trimmed[1] <= '7' {
		prio = uint8(trimmed[1] - '0')
		hasPrio = true
		trimmed = strings.TrimLeft(trimmed[3:], " \t")
		trimmed = leadingAnsiRegex.ReplaceAllString(trimmed, "")
	}

	var flags uint8
	for strings.HasPrefix(trimmed, "[cat=") {
		endIdx := strings.IndexByte(trimmed, ']')
		if endIdx == -1 {
			break
		}
		catName := strings.ToUpper(strings.TrimSpace(trimmed[5:endIdx]))
		switch catName {
		case "FINANCE":
			flags |= CatFinance
		case "BRIDGE":
			flags |= CatBridge
		case "AUTH":
			flags |= CatAuth
		default:
			// Ignore unrecognized/forged category tags like [cat=SYNTHETIC]
			return prio, hasPrio, flags, trimmed
		}
		trimmed = strings.TrimLeft(trimmed[endIdx+1:], " ")
	}
	return prio, hasPrio, flags, trimmed
}

// ParseCategoryPrefix extracts and strips leading [cat=FINANCE|BRIDGE|AUTH] prefix (FR-LOG-08).
// G-M3: SYNTHETIC cannot be injected from untrusted log text; only the sidecar sets CatSynthetic.
func ParseCategoryPrefix(raw string) (uint8, string) {
	_, _, flags, clean := ParseSyslogPriorityAndCategory(raw)
	return flags, clean
}

// RedactSafetyNet applies a secondary token redaction pass in the sidecar (FR-SEC-04).
func RedactSafetyNet(msg string) string {
	return tokenSafetyRegex.ReplaceAllString(msg, "[REDACTED-TOKEN]")
}

// TruncateUTF8Message enforces the maxBytes limit (including "[TRUNCATED]" suffix)
// in O(N) time at a valid UTF-8 character boundary (G-H10 / PRD §10.3).
func TruncateUTF8Message(msg string, maxBytes int) string {
	if maxBytes <= 0 {
		maxBytes = MaxLogMessageBytes
	}
	clean := strings.ToValidUTF8(msg, "\uFFFD")
	if len(clean) <= maxBytes {
		return clean
	}
	if maxBytes <= len(TruncatedSuffix) {
		return TruncatedSuffix[:maxBytes]
	}
	cutLimit := maxBytes - len(TruncatedSuffix)
	for cutLimit > 0 && !utf8.RuneStart(clean[cutLimit]) {
		cutLimit--
	}
	return clean[:cutLimit] + TruncatedSuffix
}

// EncodeLogRecord serializes a LogRecord into the 13-byte header + UTF-8 message format:
// [prio: u8][unit_id: u8][cat_flags: u8][timestamp_ms: u64 BE][msg_len: u16 BE][message: UTF-8]
func EncodeLogRecord(rec LogRecord) []byte {
	safeMsg := TruncateUTF8Message(RedactSafetyNet(rec.Message), MaxLogMessageBytes)
	msgBytes := []byte(safeMsg)

	out := make([]byte, LogRecordHeaderBytes+len(msgBytes))
	out[0] = rec.Prio
	out[1] = rec.UnitID
	out[2] = rec.CatFlags
	binary.BigEndian.PutUint64(out[3:11], rec.TimestampMs)
	binary.BigEndian.PutUint16(out[11:13], uint16(len(msgBytes)))
	copy(out[LogRecordHeaderBytes:], msgBytes)
	return out
}

// DecodeLogRecords unpacks one or more consecutive 13-byte header log records from a DATA payload.
func DecodeLogRecords(payload []byte) ([]LogRecord, error) {
	var records []LogRecord
	offset := 0
	for offset < len(payload) {
		if len(payload)-offset < LogRecordHeaderBytes {
			return nil, fmt.Errorf("%w: remaining %d bytes < 13", ErrMalformedRecord, len(payload)-offset)
		}
		prio := payload[offset]
		unitID := payload[offset+1]
		catFlags := payload[offset+2]
		tsMs := binary.BigEndian.Uint64(payload[offset+3 : offset+11])
		msgLen := int(binary.BigEndian.Uint16(payload[offset+11 : offset+13]))
		offset += LogRecordHeaderBytes

		if len(payload)-offset < msgLen {
			return nil, fmt.Errorf("%w: declared msg_len %d > remaining %d", ErrMalformedRecord, msgLen, len(payload)-offset)
		}
		msg := string(payload[offset : offset+msgLen])
		offset += msgLen

		records = append(records, LogRecord{
			Prio:        prio,
			UnitID:      unitID,
			CatFlags:    catFlags,
			TimestampMs: tsMs,
			Message:     msg,
		})
	}
	return records, nil
}

// MatchesFilter checks whether a LogRecord passes the client's OPEN filter parameters (FR-LOG-05).
// Synthetic overflow markers (CatSynthetic = 0x80) always pass so the user sees skipped-line notices.
func MatchesFilter(rec LogRecord, filter LogOpenParams) bool {
	if (rec.CatFlags & CatSynthetic) != 0 {
		return true
	}
	unitBit := uint8(1 << rec.UnitID)
	if filter.UnitMask != 0 && (filter.UnitMask&unitBit) == 0 {
		return false
	}
	// RFC 5424: lower number = higher severity (3=ERROR, 4=WARN, 6=INFO, 7=DEBUG)
	if filter.MinPrio > 0 && rec.Prio > filter.MinPrio {
		return false
	}
	if filter.CatMask != 0 && (rec.CatFlags&filter.CatMask) == 0 {
		return false
	}
	return true
}
