// SPDX-License-Identifier: Apache-2.0
// Package main builds release files: one executable per platform and a SHA256SUMS
// manifest, the layout the installers (install.sh, install.ps1) expect. It never tags,
// uploads or publishes; the Release workflow attaches its output to a draft release.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
)

var versionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$`)
var targetList = []string{"darwin/amd64", "darwin/arm64", "linux/amd64", "linux/arm64", "windows/amd64", "windows/arm64"}

// The copy of the Go licence that `lithosky --licenses` prints.
const goLicensePath = "third_party/GO-LICENSE"

func main() {
	verifyDir := flag.String("verify", "", "verify a release directory: SHA256SUMS, executable formats, notices and version")
	version := flag.String("version", "", "release version without a leading v, such as 0.6.0 (with -verify: the version the executables must carry)")
	out := flag.String("out", "dist/releases", "new output directory (must not exist)")
	targets := flag.String("targets", strings.Join(targetList, ","), "comma-separated OS/architecture targets, or current")
	flag.Parse()
	var err error
	if *verifyDir != "" {
		err = verify(*verifyDir, *version)
	} else {
		err = run(*version, *out, *targets)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// assetName is the release file for a target: lithosky-OS-ARCH, with .exe on Windows.
func assetName(target string) string {
	name := "lithosky-" + strings.ReplaceAll(target, "/", "-")
	if strings.HasPrefix(target, "windows/") {
		name += ".exe"
	}
	return name
}

func parseTargets(value string) ([]string, error) {
	if value == "current" {
		value = runtime.GOOS + "/" + runtime.GOARCH
	}
	result := strings.Split(value, ",")
	seen := map[string]bool{}
	for _, target := range result {
		valid := false
		for _, allowed := range targetList {
			valid = valid || target == allowed
		}
		if !valid || seen[target] {
			return nil, fmt.Errorf("invalid or duplicate target: %s", target)
		}
		seen[target] = true
	}
	return result, nil
}

func command(name string, args ...string) (string, error) {
	b, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%s: %w: %s", name, err, b)
	}
	return strings.TrimSpace(string(b)), nil
}

// checkGoLicense makes sure the Go licence built into Lithosky is the one of the
// toolchain about to compile it.
func checkGoLicense() error {
	goroot, err := command("go", "env", "GOROOT")
	if err != nil {
		return err
	}
	toolchain, err := os.ReadFile(filepath.Join(goroot, "LICENSE"))
	if err != nil {
		return err
	}
	bundled, err := os.ReadFile(goLicensePath)
	if err != nil {
		return err
	}
	if !bytes.Equal(bytes.TrimSpace(toolchain), bytes.TrimSpace(bundled)) {
		return fmt.Errorf("%s differs from this toolchain's licence; copy %s over it", goLicensePath, filepath.Join(goroot, "LICENSE"))
	}
	return nil
}

func run(version, out, targetOption string) error {
	if !versionPattern.MatchString(version) {
		return errors.New("provide a version such as 0.6.0 or 0.6.0-rc.1 (no leading v)")
	}
	targets, err := parseTargets(targetOption)
	if err != nil {
		return err
	}
	if _, err := os.Stat("go.mod"); err != nil {
		return errors.New("run from the repository root")
	}
	if _, err := os.Lstat(out); !os.IsNotExist(err) {
		return errors.New("output directory must not exist; use a fresh destination")
	}
	if err := checkGoLicense(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(out), 0755); err != nil {
		return err
	}
	stage, err := os.MkdirTemp(filepath.Dir(out), ".lithosky-release-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	if status, err := command("git", "status", "--porcelain"); err == nil && status != "" {
		fmt.Fprintln(os.Stderr, "note: the worktree has uncommitted changes; build releases from a clean, reviewed commit")
	}
	sums := map[string]string{}
	for _, target := range targets {
		parts := strings.Split(target, "/")
		name := assetName(target)
		built := filepath.Join(stage, name)
		cmd := exec.Command("go", "build", "-trimpath", "-buildvcs=false", "-ldflags=-s -w -X main.version="+version, "-o", built, ".")
		// Filter inherited cross-compilation overrides before setting this target.
		for _, v := range os.Environ() {
			if !strings.HasPrefix(v, "GOOS=") && !strings.HasPrefix(v, "GOARCH=") && !strings.HasPrefix(v, "CGO_ENABLED=") {
				cmd.Env = append(cmd.Env, v)
			}
		}
		cmd.Env = append(cmd.Env, "GOOS="+parts[0], "GOARCH="+parts[1], "CGO_ENABLED=0")
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("build %s: %w: %s", target, err, output)
		}
		if err := os.Chmod(built, 0755); err != nil {
			return err
		}
		data, err := os.ReadFile(built)
		if err != nil {
			return err
		}
		hash := sha256.Sum256(data)
		sums[name] = hex.EncodeToString(hash[:])
		fmt.Println(name)
	}
	if err := os.WriteFile(filepath.Join(stage, "SHA256SUMS"), []byte(manifest(sums)), 0644); err != nil {
		return err
	}
	return os.Rename(stage, out)
}

// manifest formats checksums the way sha256sum does, sorted by name.
func manifest(sums map[string]string) string {
	names := make([]string, 0, len(sums))
	for name := range sums {
		names = append(names, name)
	}
	sort.Strings(names)
	var b strings.Builder
	for _, name := range names {
		fmt.Fprintf(&b, "%s  %s\n", sums[name], name)
	}
	return b.String()
}
