// SPDX-License-Identifier: Apache-2.0
package desktop

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestBrowserHolds(t *testing.T) {
	profile := t.TempDir()
	if browserHolds(profile) {
		t.Fatal("empty profile held")
	}
	path := filepath.Join(profile, "lockfile")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if browserHolds(profile) {
		t.Fatal("stale lockfile held")
	}
	// Chromium keeps its lockfile open, shared for reading only.
	name, _ := syscall.UTF16PtrFromString(path)
	handle, err := syscall.CreateFile(name, syscall.GENERIC_WRITE, syscall.FILE_SHARE_READ, nil,
		syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.CloseHandle(handle)
	if !browserHolds(profile) {
		t.Fatal("open lockfile not held")
	}
}
