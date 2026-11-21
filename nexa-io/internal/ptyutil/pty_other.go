//go:build !linux

package ptyutil

import (
	"errors"
	"io"
	"time"
)

// WaitTeardown is a no-op on non-Linux targets.
func WaitTeardown(_ time.Duration) {}

// Session represents a live PTY-backed shell process.
type Session interface {
	io.ReadWriteCloser
	Resize(rows, cols uint16) error
	SignalWinch() error
	KillGroup() error
}

// StartShell is only supported on Linux VPS targets.
func StartShell(shellPath string, homeDir string, userName string, rows, cols uint16) (Session, error) {
	return nil, errors.New("Linux PTY is only supported on Linux targets")
}
