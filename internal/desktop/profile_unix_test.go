// SPDX-License-Identifier: Apache-2.0
//go:build darwin || linux || freebsd || netbsd || openbsd || dragonfly

package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestBrowserHolds(t *testing.T) {
	profile := t.TempDir()
	if browserHolds(profile) {
		t.Fatal("empty profile held")
	}
	host, _ := os.Hostname()
	link := filepath.Join(profile, "SingletonLock")
	for _, check := range []struct {
		target string
		held   bool
	}{
		{fmt.Sprintf("%s-%d", host, os.Getpid()), true},
		{fmt.Sprintf("%s-%d", host, 1<<30), false},
		{fmt.Sprintf("elsewhere-%d", os.Getpid()), true},
	} {
		_ = os.Remove(link)
		if err := os.Symlink(check.target, link); err != nil {
			t.Fatal(err)
		}
		if browserHolds(profile) != check.held {
			t.Fatalf("%s: want held=%v", check.target, check.held)
		}
	}
}
