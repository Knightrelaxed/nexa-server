//go:build unix || linux

package logstream

import "syscall"

func setFDCloExec(fd int) {
	syscall.CloseOnExec(fd)
}
