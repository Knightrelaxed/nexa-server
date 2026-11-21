//go:build !unix && !linux

package logstream

func setFDCloExec(fd int) {
	_ = fd
}
