// Package ws implements a lightweight RFC 6455 WebSocket server connection
// dedicated to binary frames (PRD §10.1: permessage-deflate disabled, <= 4 KiB frames).
package ws

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

const (
	wsGUID              = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	opContinuation      = 0x0
	opText              = 0x1
	opBinary            = 0x2
	opClose             = 0x8
	opPing              = 0x9
	opPong              = 0xA
	maxInboundBytes     = 8192
	maxInboundFragments = 16
)

var (
	ErrNotWebSocket  = errors.New("request is not a valid WebSocket upgrade")
	ErrFrameTooLarge = errors.New("inbound WebSocket frame exceeds limit")
	ErrProtocolError = errors.New("WebSocket RFC 6455 protocol violation")
	ErrConnClosed    = errors.New("WebSocket connection closed")
)

// Conn wraps a hijacked TCP/Unix socket after an RFC 6455 WebSocket upgrade.
type Conn struct {
	raw       net.Conn
	br        *bufio.Reader
	writeMu   sync.Mutex
	closeSent bool // H2: prevents writing any frames after RFC 6455 opClose
	closed    atomic.Bool
	closeOnce sync.Once
}

// UpgradeHTTP performs the RFC 6455 handshake with permessage-deflate disabled (G-H8).
func UpgradeHTTP(w http.ResponseWriter, r *http.Request) (*Conn, error) {
	return UpgradeHTTPWithProtocol(w, r, "")
}

// UpgradeHTTPWithProtocol performs the RFC 6455 handshake and optionally echoes
// a validated Sec-WebSocket-Protocol token (e.g. "nexa-io-v1" for browser clients).
func UpgradeHTTPWithProtocol(w http.ResponseWriter, r *http.Request, selectedSubprotocol string) (*Conn, error) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET method required for websocket upgrade", http.StatusMethodNotAllowed)
		return nil, ErrNotWebSocket
	}
	if !headerContainsToken(r.Header, "Connection", "upgrade") ||
		!headerContainsToken(r.Header, "Upgrade", "websocket") {
		http.Error(w, "websocket upgrade required", http.StatusUpgradeRequired)
		return nil, ErrNotWebSocket
	}
	if strings.TrimSpace(r.Header.Get("Sec-WebSocket-Version")) != "13" {
		w.Header().Set("Sec-WebSocket-Version", "13")
		http.Error(w, "Sec-WebSocket-Version 13 required", http.StatusUpgradeRequired)
		return nil, ErrNotWebSocket
	}

	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	decodedKey, keyErr := base64.StdEncoding.DecodeString(key)
	if key == "" || keyErr != nil || len(decodedKey) != 16 {
		http.Error(w, "invalid Sec-WebSocket-Key", http.StatusBadRequest)
		return nil, ErrNotWebSocket
	}

	protoHeader := ""
	if selectedSubprotocol != "" {
		cleanProto := strings.TrimSpace(selectedSubprotocol)
		if strings.ContainsAny(cleanProto, "\r\n\t ,") {
			http.Error(w, "invalid subprotocol", http.StatusBadRequest)
			return nil, ErrNotWebSocket
		}
		protoHeader = "Sec-WebSocket-Protocol: " + cleanProto + "\r\n"
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "webserver does not support hijacking", http.StatusInternalServerError)
		return nil, errors.New("http.Hijacker unsupported")
	}

	rawConn, brw, err := hj.Hijack()
	if err != nil {
		return nil, fmt.Errorf("hijack connection: %w", err)
	}

	accept := computeAcceptKey(key)
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n" +
		protoHeader + "\r\n"

	_ = rawConn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if _, err := brw.WriteString(resp); err != nil {
		_ = rawConn.Close()
		return nil, fmt.Errorf("write handshake response: %w", err)
	}
	if err := brw.Flush(); err != nil {
		_ = rawConn.Close()
		return nil, fmt.Errorf("flush handshake response: %w", err)
	}
	_ = rawConn.SetWriteDeadline(time.Time{})

	return &Conn{
		raw: rawConn,
		br:  brw.Reader,
	}, nil
}

func computeAcceptKey(key string) string {
	h := sha1.New()
	_, _ = io.WriteString(h, key+wsGUID)
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func headerContainsToken(h http.Header, key, token string) bool {
	for _, v := range h.Values(key) {
		for _, part := range strings.Split(v, ",") {
			if strings.EqualFold(strings.TrimSpace(part), token) {
				return true
			}
		}
	}
	return false
}

// SetReadDeadline sets the read deadline on the underlying net.Conn.
func (c *Conn) SetReadDeadline(t time.Time) error {
	return c.raw.SetReadDeadline(t)
}

// ReadBinaryFrame reads the next binary data frame from the client with strict RFC 6455 validation:
// requires client masking, RSV=0, FIN && len<=125 on control frames, and valid fragmentation state (G-H8, M1).
func (c *Conn) ReadBinaryFrame() ([]byte, error) {
	var assembled []byte
	inFragment := false
	fragCount := 0

	for {
		var hdr [2]byte
		if _, err := io.ReadFull(c.br, hdr[:]); err != nil {
			return nil, err
		}

		fin := (hdr[0] & 0x80) != 0
		rsv := hdr[0] & 0x70
		opcode := hdr[0] & 0x0F
		masked := (hdr[1] & 0x80) != 0
		payloadLen := uint64(hdr[1] & 0x7F)

		if rsv != 0 {
			_ = c.WriteCloseFrame(1002, "non-zero RSV bits")
			_ = c.Close()
			return nil, ErrProtocolError
		}
		if !masked {
			_ = c.WriteCloseFrame(1002, "client frames must be masked")
			_ = c.Close()
			return nil, ErrProtocolError
		}

		isControl := opcode >= 0x8
		if isControl && (!fin || payloadLen > 125) {
			_ = c.WriteCloseFrame(1002, "invalid control frame")
			_ = c.Close()
			return nil, ErrProtocolError
		}

		switch payloadLen {
		case 126:
			var ext [2]byte
			if _, err := io.ReadFull(c.br, ext[:]); err != nil {
				return nil, err
			}
			payloadLen = uint64(binary.BigEndian.Uint16(ext[:]))
		case 127:
			var ext [8]byte
			if _, err := io.ReadFull(c.br, ext[:]); err != nil {
				return nil, err
			}
			payloadLen = binary.BigEndian.Uint64(ext[:])
		}

		// M1: Do not add interleaved control frame payload length onto fragmented data assembly limit
		if payloadLen > maxInboundBytes || (!isControl && uint64(len(assembled))+payloadLen > maxInboundBytes) {
			_ = c.WriteCloseFrame(1009, "frame too large")
			_ = c.Close()
			return nil, ErrFrameTooLarge
		}

		var maskKey [4]byte
		if _, err := io.ReadFull(c.br, maskKey[:]); err != nil {
			return nil, err
		}

		payload := make([]byte, int(payloadLen))
		if _, err := io.ReadFull(c.br, payload); err != nil {
			return nil, err
		}
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}

		switch opcode {
		case opPing:
			_ = c.writeRawFrame(opPong, payload)
			continue
		case opPong:
			continue
		case opClose:
			// M1: RFC 6455 §5.5.1 forbids 1-byte close payloads
			if len(payload) == 1 {
				_ = c.WriteCloseFrame(1002, "invalid 1-byte close payload")
				_ = c.Close()
				return nil, ErrProtocolError
			}
			_ = c.WriteCloseFrame(1000, "")
			_ = c.Close()
			return nil, ErrConnClosed
		case opBinary:
			if inFragment {
				_ = c.WriteCloseFrame(1002, "unexpected binary start during fragmentation")
				_ = c.Close()
				return nil, ErrProtocolError
			}
			assembled = append(assembled[:0], payload...)
			if fin {
				return assembled, nil
			}
			inFragment = true
			fragCount = 1
		case opContinuation:
			if !inFragment {
				_ = c.WriteCloseFrame(1002, "unexpected continuation frame")
				_ = c.Close()
				return nil, ErrProtocolError
			}
			fragCount++
			if fragCount > maxInboundFragments {
				_ = c.WriteCloseFrame(1009, "too many continuation fragments")
				_ = c.Close()
				return nil, ErrFrameTooLarge
			}
			assembled = append(assembled, payload...)
			if fin {
				return assembled, nil
			}
		case opText:
			_ = c.WriteCloseFrame(1003, "binary frames only")
			_ = c.Close()
			return nil, ErrProtocolError
		default:
			_ = c.WriteCloseFrame(1002, "unsupported opcode")
			_ = c.Close()
			return nil, fmt.Errorf("unsupported websocket opcode: 0x%x", opcode)
		}
	}
}

// WriteBinaryFrame writes an unmasked binary frame to the client in a thread-safe manner.
func (c *Conn) WriteBinaryFrame(payload []byte) error {
	return c.writeRawFrame(opBinary, payload)
}

// WriteCloseFrame writes an RFC 6455 Close control frame (opcode 0x8) with status code (e.g. 1000)
// so OkHttp receives onClosing/onClosed cleanly instead of EOFException (G-H8, M1).
func (c *Conn) WriteCloseFrame(code uint16, reason string) error {
	clean := strings.ToValidUTF8(reason, "\uFFFD")
	if len(clean) > 123 {
		cut := 123
		for cut > 0 && !utf8.RuneStart(clean[cut]) {
			cut--
		}
		clean = clean[:cut]
	}
	payload := make([]byte, 2+len(clean))
	binary.BigEndian.PutUint16(payload[0:2], code)
	copy(payload[2:], clean)
	return c.writeRawFrame(opClose, payload)
}

func (c *Conn) writeRawFrame(opcode byte, payload []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if c.closed.Load() || c.closeSent {
		return ErrConnClosed
	}

	length := len(payload)
	var hdrLen int
	switch {
	case length < 126:
		hdrLen = 2
	case length <= 65535:
		hdrLen = 4
	default:
		hdrLen = 10
	}

	// G-H8: Pack header + payload into a single buffer to avoid partial-write stream corruption
	frame := make([]byte, hdrLen+length)
	frame[0] = 0x80 | opcode
	switch hdrLen {
	case 2:
		frame[1] = byte(length)
	case 4:
		frame[1] = 126
		binary.BigEndian.PutUint16(frame[2:4], uint16(length))
	default:
		frame[1] = 127
		binary.BigEndian.PutUint64(frame[2:10], uint64(length))
	}
	if length > 0 {
		copy(frame[hdrLen:], payload)
	}

	if opcode == opClose {
		c.closeSent = true
	}

	_ = c.raw.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if _, err := c.raw.Write(frame); err != nil {
		// Close socket immediately on write error so partial frames cannot corrupt subsequent writes
		_ = c.Close()
		return err
	}
	return nil
}

// Close closes the underlying connection idempotently WITHOUT acquiring writeMu,
// preventing 10s-20s deadlocks when another goroutine is blocked in writeRawFrame (G-H7).
func (c *Conn) Close() error {
	var err error
	c.closeOnce.Do(func() {
		c.closed.Store(true)
		err = c.raw.Close()
	})
	return err
}
