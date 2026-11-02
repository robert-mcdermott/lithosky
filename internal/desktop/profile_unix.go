// SPDX-License-Identifier: Apache-2.0
//go:build darwin || linux || freebsd || netbsd || openbsd || dragonfly

package desktop

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// lockFile takes an exclusive flock on `path`; the kernel drops it when the process ends.
func lockFile(path string) (func(), error) {
	file, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		return nil, err
	}
	return func() { _ = file.Close() }, nil
}

// browserHolds reports whether the profile's Chromium `SingletonLock` link ("host-pid")
// names a live process. A lock from another host counts as held.
func browserHolds(profile string) bool {
	target, err := os.Readlink(filepath.Join(profile, "SingletonLock"))
	if err != nil {
		return false
	}
	split := strings.LastIndex(target, "-")
	if split < 0 {
		return true
	}
	pid, err := strconv.Atoi(target[split+1:])
	if host, _ := os.Hostname(); err != nil || host != target[:split] {
		return true
	}
	err = syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}
