// SPDX-License-Identifier: Apache-2.0
package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestAssetNamesAndVersions(t *testing.T) {
	want := map[string]string{
		"darwin/arm64":  "lithosky-darwin-arm64",
		"linux/amd64":   "lithosky-linux-amd64",
		"windows/arm64": "lithosky-windows-arm64.exe",
	}
	for target, name := range want {
		if got := assetName(target); got != name {
			t.Errorf("%s: %s, want %s", target, got, name)
		}
	}
	for _, good := range []string{"0.6.0", "1.2.3", "0.6.0-rc.1", "0.6.0-dev.1"} {
		if !versionPattern.MatchString(good) {
			t.Errorf("%s should be a valid version", good)
		}
	}
	for _, bad := range []string{"v0.6.0", "0.6", "01.2.3", "0.6.0-", ""} {
		if versionPattern.MatchString(bad) {
			t.Errorf("%s should be rejected", bad)
		}
	}
	if _, err := parseTargets("linux/amd64,linux/amd64"); err == nil {
		t.Error("duplicate targets should be rejected")
	}
}

func TestManifestIsSortedLikeSha256sum(t *testing.T) {
	got := manifest(map[string]string{"lithosky-linux-amd64": strings.Repeat("b", 64), "lithosky-darwin-arm64": strings.Repeat("a", 64)})
	want := strings.Repeat("a", 64) + "  lithosky-darwin-arm64\n" + strings.Repeat("b", 64) + "  lithosky-linux-amd64\n"
	if got != want {
		t.Fatalf("manifest:\n%s", got)
	}
}

// Builds this computer's release file, verifies it, then checks that tampering of each
// kind is refused.
func TestBuildVerifyAndTamper(t *testing.T) {
	if testing.Short() {
		t.Skip("builds an executable")
	}
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	t.Chdir(root)
	out := filepath.Join(t.TempDir(), "release")
	if err := run("0.0.1-test.1", out, "current"); err != nil {
		t.Fatal(err)
	}
	name := assetName(runtime.GOOS + "/" + runtime.GOARCH)
	binary := filepath.Join(out, name)
	if err := verify(out, "0.0.1-test.1"); err != nil {
		t.Fatalf("a fresh release should verify: %v", err)
	}
	if err := verify(out, "0.0.2"); err == nil {
		t.Fatal("the wrong version should be refused")
	}

	original, err := os.ReadFile(binary)
	if err != nil {
		t.Fatal(err)
	}
	restore := func() {
		t.Helper()
		if err := os.WriteFile(binary, original, 0755); err != nil {
			t.Fatal(err)
		}
	}
	expectRefused := func(what, wantError string) {
		t.Helper()
		err := verify(out, "")
		if err == nil || !strings.Contains(err.Error(), wantError) {
			t.Fatalf("%s: want an error containing %q, got %v", what, wantError, err)
		}
	}

	if err := os.WriteFile(binary, append(append([]byte{}, original...), 0), 0755); err != nil {
		t.Fatal(err)
	}
	expectRefused("a changed executable", "checksum mismatch")
	restore()

	extra := filepath.Join(out, "notes.txt")
	if err := os.WriteFile(extra, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	expectRefused("an unlisted file", "not listed")
	os.Remove(extra)

	sums, err := os.ReadFile(filepath.Join(out, "SHA256SUMS"))
	if err != nil {
		t.Fatal(err)
	}
	other := "lithosky-linux-arm64"
	if name == other {
		other = "lithosky-darwin-arm64"
	}
	if err := os.WriteFile(filepath.Join(out, other), original, 0755); err != nil {
		t.Fatal(err)
	}
	renamed := strings.Replace(string(sums), name, other, 1)
	if err := os.WriteFile(filepath.Join(out, "SHA256SUMS"), []byte(renamed), 0644); err != nil {
		t.Fatal(err)
	}
	os.Remove(binary)
	expectRefused("an executable named for another platform", "not a")
}
