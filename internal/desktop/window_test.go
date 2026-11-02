// SPDX-License-Identifier: Apache-2.0
package desktop

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppIsolation(t *testing.T) {
	args := appArguments("http://127.0.0.1:1234", "/tmp/profile with spaces")
	if args[0] != "--app=http://127.0.0.1:1234" || args[1] != "--user-data-dir=/tmp/profile with spaces" {
		t.Fatal(args)
	}
	for _, arg := range args {
		if strings.Contains(arg, "no-sandbox") || strings.Contains(arg, "disable-web-security") {
			t.Fatal("browser safety disabled")
		}
	}
}

func TestLaunchFailure(t *testing.T) {
	profile := filepath.Join(t.TempDir(), "profile")
	if _, err := Open("http://127.0.0.1:1234", "app", "/nonexistent/lithosky-browser", profile); err == nil {
		t.Fatal("missing executable accepted")
	}
	// A failed launch leaves the persistent profile free for the next one.
	_, release, err := claimProfile(profile)
	if err != nil {
		t.Fatal(err)
	}
	release()
}

func TestProfileClaim(t *testing.T) {
	persistent := filepath.Join(t.TempDir(), "profile")
	first, releaseFirst, err := claimProfile(persistent)
	if err != nil || first != persistent {
		t.Fatalf("first claim got %q, %v", first, err)
	}
	// A second window while the first is open gets a temporary profile, removed on release.
	second, releaseSecond, err := claimProfile(persistent)
	if err != nil || second == persistent {
		t.Fatalf("second claim got %q, %v", second, err)
	}
	releaseSecond()
	if _, err := os.Stat(second); !os.IsNotExist(err) {
		t.Fatal("temporary profile kept")
	}
	releaseFirst()
	again, releaseAgain, err := claimProfile(persistent)
	if err != nil || again != persistent {
		t.Fatalf("claim after release got %q, %v", again, err)
	}
	releaseAgain()
	if _, err := os.Stat(persistent); err != nil {
		t.Fatal("persistent profile removed")
	}
}

func TestNoPersistentProfile(t *testing.T) {
	profile, release, err := claimProfile("")
	if err != nil || !strings.Contains(filepath.Base(profile), "lithosky-window-") {
		t.Fatalf("got %q, %v", profile, err)
	}
	release()
}
