//go:build linux

// Package ptyutil manages Linux pseudo-terminals (PTY) via kernel ioctls
// without external dependencies, enforcing clean environment (FR-SEC-03) and
// process-group teardown (SIGHUP -> 2s -> SIGKILL, FR-TERM-12).
package ptyutil

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var teardownWG sync.WaitGroup

// WaitTeardown waits up to timeout for any in-flight PTY process-group SIGKILL escalation goroutines (H1).
func WaitTeardown(timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		teardownWG.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
	}
}

const (
	ioctlTIOCGPTN   = 0x80045430
	ioctlTIOCSPTLCK = 0x40045431
	ioctlTIOCSWINSZ = 0x5414
	ioctlTIOCGPGRP  = 0x540F
)

type winsize struct {
	Rows uint16
	Cols uint16
	X    uint16
	Y    uint16
}

// Session represents a live PTY-backed shell process.
type Session interface {
	io.ReadWriteCloser
	Resize(rows, cols uint16) error
	SignalWinch() error
	KillGroup() error
}

type linuxPTY struct {
	master   *os.File
	cmd      *exec.Cmd
	pgid     int
	doneCh   chan struct{}
	killOnce sync.Once
}

// runIoctl executes an ioctl on f via SyscallConn().Control so f NEVER drops out of Go's
// epoll non-blocking netpoller (G-C5).
func runIoctl(f *os.File, req uintptr, arg uintptr) error {
	rc, err := f.SyscallConn()
	if err != nil {
		return err
	}
	var ioctlErr error
	ctrlErr := rc.Control(func(fd uintptr) {
		_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, req, arg)
		if errno != 0 {
			ioctlErr = errno
		}
	})
	if ctrlErr != nil {
		return ctrlErr
	}
	return ioctlErr
}

// StartShell spawns a clean-environment login shell attached to a Linux PTY (FR-TERM-01, FR-SEC-03).
func StartShell(shellPath string, homeDir string, userName string, rows, cols uint16) (Session, error) {
	if shellPath == "" {
		shellPath = "/bin/bash"
	}
	if homeDir == "" {
		homeDir = "/var/lib/nexa-term"
	}
	if userName == "" {
		userName = "nexa-term"
	}
	if rows == 0 {
		rows = 24
	}
	if cols == 0 {
		cols = 80
	}

	master, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		return nil, fmt.Errorf("open /dev/ptmx: %w", err)
	}

	// Unlock slave PTY via SyscallConn().Control (keeps master non-blocking in epoll!)
	var unlock int32 = 0
	if err := runIoctl(master, ioctlTIOCSPTLCK, uintptr(unsafe.Pointer(&unlock))); err != nil {
		_ = master.Close()
		return nil, fmt.Errorf("TIOCSPTLCK: %w", err)
	}

	// Query slave PTY number
	var ptyNum uint32
	if err := runIoctl(master, ioctlTIOCGPTN, uintptr(unsafe.Pointer(&ptyNum))); err != nil {
		_ = master.Close()
		return nil, fmt.Errorf("TIOCGPTN: %w", err)
	}

	slavePath := fmt.Sprintf("/dev/pts/%d", ptyNum)
	slave, err := os.OpenFile(slavePath, os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		_ = master.Close()
		return nil, fmt.Errorf("open slave %s: %w", slavePath, err)
	}

	// Apply initial window dimensions
	ws := winsize{Rows: rows, Cols: cols}
	_ = runIoctl(master, ioctlTIOCSWINSZ, uintptr(unsafe.Pointer(&ws)))

	cmd := exec.Command(shellPath, "-l")
	// FR-SEC-03: Strictly clean environment (never inherit sidecar env vars)
	cmd.Env = []string{
		"HOME=" + homeDir,
		"USER=" + userName,
		"TERM=xterm-256color",
		"LANG=C.UTF-8",
		"PATH=/usr/local/bin:/usr/bin:/bin",
	}
	cmd.Dir = homeDir
	if _, statErr := os.Stat(homeDir); statErr != nil {
		cmd.Dir = "/tmp"
	}
	cmd.Stdin = slave
	cmd.Stdout = slave
	cmd.Stderr = slave
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
		Ctty:    0,
	}

	if err := cmd.Start(); err != nil {
		_ = slave.Close()
		_ = master.Close()
		return nil, fmt.Errorf("start shell %s: %w", shellPath, err)
	}
	_ = slave.Close()

	pgid := cmd.Process.Pid
	doneCh := make(chan struct{})
	p := &linuxPTY{
		master: master,
		cmd:    cmd,
		pgid:   pgid,
		doneCh: doneCh,
	}

	// Reap child process in background so zombies never accumulate (FR-TERM-12)
	// and close doneCh to guard against PID reuse before delayed SIGKILL (G-H4).
	go func() {
		_ = cmd.Wait()
		close(doneCh)
	}()

	return p, nil
}

func (p *linuxPTY) foregroundPGID() int {
	var fg int32
	if err := runIoctl(p.master, ioctlTIOCGPGRP, uintptr(unsafe.Pointer(&fg))); err == nil && fg > 0 {
		return int(fg)
	}
	return 0
}

func (p *linuxPTY) Read(b []byte) (int, error) {
	return p.master.Read(b)
}

func (p *linuxPTY) Write(b []byte) (int, error) {
	return p.master.Write(b)
}

func (p *linuxPTY) Resize(rows, cols uint16) error {
	if rows == 0 {
		rows = 24
	}
	if cols == 0 {
		cols = 80
	}
	ws := winsize{Rows: rows, Cols: cols}
	return runIoctl(p.master, ioctlTIOCSWINSZ, uintptr(unsafe.Pointer(&ws)))
}

// SignalWinch delivers SIGWINCH to the active foreground process group (e.g. htop/nano)
// as well as the login shell's process group (G-H4).
func (p *linuxPTY) SignalWinch() error {
	fg := p.foregroundPGID()
	if fg > 0 {
		_ = syscall.Kill(-fg, syscall.SIGWINCH)
	}
	if p.pgid > 0 && p.pgid != fg {
		_ = syscall.Kill(-p.pgid, syscall.SIGWINCH)
	}
	return nil
}

// listSessionPIDs scans /proc for all PIDs belonging to session ID targetSID (H1),
// catching backgrounded jobs that moved to their own process group via job control.
func listSessionPIDs(targetSID int) []int {
	if targetSID <= 0 {
		return nil
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}
	var pids []int
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid <= 1 {
			continue
		}
		statBytes, err := os.ReadFile(filepath.Join("/proc", entry.Name(), "stat"))
		if err != nil {
			continue
		}
		// Format: pid (comm) state ppid pgrp session ...
		// comm may contain spaces/parens, so find the LAST ')'
		statStr := string(statBytes)
		rparen := strings.LastIndexByte(statStr, ')')
		if rparen < 0 || rparen+2 >= len(statStr) {
			continue
		}
		fields := strings.Fields(statStr[rparen+2:])
		// fields[0]=state, [1]=ppid, [2]=pgrp, [3]=session
		if len(fields) >= 4 {
			if sid, convErr := strconv.Atoi(fields[3]); convErr == nil && sid == targetSID {
				pids = append(pids, pid)
			}
		}
	}
	return pids
}

func signalSessionMembers(targetSID, fgPGID int, sig syscall.Signal) int {
	if fgPGID > 0 {
		_ = syscall.Kill(-fgPGID, sig)
	}
	if targetSID > 0 && targetSID != fgPGID {
		_ = syscall.Kill(-targetSID, sig)
	}
	members := listSessionPIDs(targetSID)
	for _, pid := range members {
		_ = syscall.Kill(pid, sig)
	}
	return len(members)
}

// KillGroup sends SIGHUP to the foreground PGID, shell PGID, and every PID in the PTY session
// (via /proc SID scan, H1), waits up to 2 seconds while checking whether any session members
// remain alive (never aborting early just because bash exited while background jobs linger),
// and escalates to SIGKILL. Tracked by teardownWG for clean shutdown waiting.
func (p *linuxPTY) KillGroup() error {
	var closeErr error
	p.killOnce.Do(func() {
		fg := p.foregroundPGID()
		signalSessionMembers(p.pgid, fg, syscall.SIGHUP)
		closeErr = p.master.Close()

		teardownWG.Add(1)
		go func() {
			defer teardownWG.Done()
			deadline := time.Now().Add(2 * time.Second)
			ticker := time.NewTicker(100 * time.Millisecond)
			defer ticker.Stop()

			for {
				shellExited := false
				select {
				case <-p.doneCh:
					shellExited = true
				default:
				}
				if shellExited && len(listSessionPIDs(p.pgid)) == 0 {
					return
				}
				if time.Now().After(deadline) {
					// Escalate to SIGKILL on remaining session members only (safe against PID reuse via SID check)
					remaining := listSessionPIDs(p.pgid)
					for _, pid := range remaining {
						_ = syscall.Kill(pid, syscall.SIGKILL)
					}
					if !shellExited && p.pgid > 0 {
						_ = syscall.Kill(-p.pgid, syscall.SIGKILL)
					}
					return
				}
				<-ticker.C
			}
		}()
	})
	return closeErr
}

func (p *linuxPTY) Close() error {
	return p.KillGroup()
}
