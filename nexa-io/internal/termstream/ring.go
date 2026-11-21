package termstream

import "sync"

// ReplayRing stores the last capacity bytes (default 64 KiB) of a terminal PTY
// output stream along with the cumulative sentOffset (FR-TERM-11, PRD §10.4).
type ReplayRing struct {
	mu         sync.Mutex
	buf        []byte
	cap        int
	writePos   int
	filled     int
	sentOffset uint64
}

// NewReplayRing creates a fixed-size byte ring buffer.
func NewReplayRing(capacity int) *ReplayRing {
	if capacity <= 0 {
		capacity = 64 * 1024
	}
	return &ReplayRing{
		buf: make([]byte, capacity),
		cap: capacity,
	}
}

// Append writes data into the ring buffer and advances sentOffset.
func (r *ReplayRing) Append(data []byte) uint64 {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(data) == 0 {
		return r.sentOffset
	}

	if len(data) >= r.cap {
		// Only keep the trailing r.cap bytes
		copy(r.buf, data[len(data)-r.cap:])
		r.writePos = 0
		r.filled = r.cap
		r.sentOffset += uint64(len(data))
		return r.sentOffset
	}

	first := r.cap - r.writePos
	if first >= len(data) {
		copy(r.buf[r.writePos:], data)
	} else {
		copy(r.buf[r.writePos:], data[:first])
		copy(r.buf[0:], data[first:])
	}
	r.writePos = (r.writePos + len(data)) % r.cap
	r.filled += len(data)
	if r.filled > r.cap {
		r.filled = r.cap
	}
	r.sentOffset += uint64(len(data))
	return r.sentOffset
}

// SentOffset returns the total cumulative bytes ever appended.
func (r *ReplayRing) SentOffset() uint64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sentOffset
}

// SliceFrom returns all bytes from receivedOffset up to sentOffset.
// If receivedOffset is older than the oldest byte still in the ring OR ahead of sentOffset (desync),
// ok is false so the caller can trigger an offset reset + SIGWINCH redraw (PRD §10.4 / G-M5).
func (r *ReplayRing) SliceFrom(receivedOffset uint64) (data []byte, ok bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if receivedOffset > r.sentOffset {
		return nil, false
	}
	if receivedOffset == r.sentOffset {
		return nil, true
	}

	oldestOffset := r.sentOffset - uint64(r.filled)
	if receivedOffset < oldestOffset {
		return nil, false
	}

	delta := int(r.sentOffset - receivedOffset)
	if delta == 0 {
		return nil, true
	}

	out := make([]byte, delta)
	startPos := (r.writePos - delta + r.cap) % r.cap
	first := r.cap - startPos
	if first >= delta {
		copy(out, r.buf[startPos:startPos+delta])
	} else {
		copy(out[:first], r.buf[startPos:])
		copy(out[first:], r.buf[:delta-first])
	}
	return out, true
}
