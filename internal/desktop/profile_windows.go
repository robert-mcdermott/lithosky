// SPDX-License-Identifier: Apache-2.0
package desktop

import (
	"os"
	"path/filepath"
	"syscall"
)

// lockFile opens `path` without sharing; Windows drops the lock when the process ends.
func lockFile(path string) (func(), error) {
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	handle, err := syscall.CreateFile(name, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil,
		syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, err
	}
	return func() { _ = syscall.CloseHandle(handle) }, nil
}

// browserHolds reports whether a running Chromium keeps the profile's `lockfile` open;
// it shares that file for reading only.
func browserHolds(profile string) bool {
	file, err := os.OpenFile(filepath.Join(profile, "lockfile"), os.O_WRONLY, 0)
	if err != nil {
		return !os.IsNotExist(err)
	}
	_ = file.Close()
	return false
}
