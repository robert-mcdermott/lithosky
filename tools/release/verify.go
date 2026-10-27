// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"debug/elf"
	"debug/macho"
	"debug/pe"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var (
	manifestLine = regexp.MustCompile(`^([0-9a-f]{64})  (\S+)$`)
	assetPattern = regexp.MustCompile(`^lithosky-(darwin|linux|windows)-(amd64|arm64)(\.exe)?$`)
)

// Text every executable embeds for `lithosky --licenses`.
var requiredNotices = [][]byte{[]byte("Apache License"), []byte("The Go Authors")}

// verify checks a release directory: SHA256SUMS names every file exactly once with the
// right hash and nothing else is present; each executable is built for the platform its
// name says and carries the licence notices (and `version`, when given); and the one for
// this computer runs and reports its version.
func verify(dir, version string) error {
	if version != "" && !versionPattern.MatchString(version) {
		return fmt.Errorf("invalid version %q (no leading v)", version)
	}
	sums, err := readManifest(filepath.Join(dir, "SHA256SUMS"))
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.Name() == "SHA256SUMS" {
			continue
		}
		if _, listed := sums[entry.Name()]; !listed {
			return fmt.Errorf("%s is not listed in SHA256SUMS", entry.Name())
		}
	}
	for name, want := range sums {
		path := filepath.Join(dir, name)
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("%s: listed in SHA256SUMS but missing or not a regular file", name)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		hash := sha256.Sum256(data)
		if got := hex.EncodeToString(hash[:]); got != want {
			return fmt.Errorf("%s: checksum mismatch (SHA256SUMS %s, file %s)", name, want, got)
		}
		if err := checkFormat(name, data); err != nil {
			return err
		}
		for _, notice := range requiredNotices {
			if !bytes.Contains(data, notice) {
				return fmt.Errorf("%s: missing the embedded notice %q", name, notice)
			}
		}
		if version != "" && !bytes.Contains(data, []byte(version)) {
			return fmt.Errorf("%s: does not carry version %s", name, version)
		}
		if name == assetName(runtime.GOOS+"/"+runtime.GOARCH) {
			if err := checkRuns(path, version); err != nil {
				return err
			}
		}
		fmt.Println("Verified", name)
	}
	return nil
}

func readManifest(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("SHA256SUMS: %w", err)
	}
	defer file.Close()
	sums := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		match := manifestLine.FindStringSubmatch(scanner.Text())
		if match == nil {
			return nil, fmt.Errorf("SHA256SUMS: malformed line %q", scanner.Text())
		}
		name := match[2]
		parts := assetPattern.FindStringSubmatch(name)
		if parts == nil || (parts[1] == "windows") != (parts[3] == ".exe") {
			return nil, fmt.Errorf("SHA256SUMS: unexpected file name %q", name)
		}
		if _, duplicate := sums[name]; duplicate {
			return nil, fmt.Errorf("SHA256SUMS: %s is listed twice", name)
		}
		sums[name] = match[1]
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if len(sums) == 0 {
		return nil, errors.New("SHA256SUMS lists no files")
	}
	return sums, nil
}

// checkFormat confirms an executable is built for the OS and CPU its name says.
func checkFormat(name string, data []byte) error {
	parts := assetPattern.FindStringSubmatch(name)
	osName, arch := parts[1], parts[2]
	reader := bytes.NewReader(data)
	ok := false
	switch osName {
	case "darwin":
		file, err := macho.NewFile(reader)
		if err == nil {
			ok = (arch == "amd64" && file.Cpu == macho.CpuAmd64) || (arch == "arm64" && file.Cpu == macho.CpuArm64)
		}
	case "linux":
		file, err := elf.NewFile(reader)
		if err == nil {
			ok = (arch == "amd64" && file.Machine == elf.EM_X86_64) || (arch == "arm64" && file.Machine == elf.EM_AARCH64)
		}
	case "windows":
		file, err := pe.NewFile(reader)
		if err == nil {
			ok = (arch == "amd64" && file.Machine == pe.IMAGE_FILE_MACHINE_AMD64) || (arch == "arm64" && file.Machine == pe.IMAGE_FILE_MACHINE_ARM64)
		}
	}
	if !ok {
		return fmt.Errorf("%s: not a %s/%s executable", name, osName, arch)
	}
	return nil
}

// checkRuns starts this computer's executable and checks the version it reports.
func checkRuns(path, version string) error {
	output, err := exec.Command(path, "--version").CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s --version: %w: %s", filepath.Base(path), err, output)
	}
	identity := strings.TrimSpace(string(output))
	if !strings.HasPrefix(identity, "Lithosky ") || (version != "" && identity != "Lithosky "+version) {
		return fmt.Errorf("%s reports %q", filepath.Base(path), identity)
	}
	return nil
}
