// SPDX-License-Identifier: Apache-2.0
// Package main builds local distribution artifacts. It never tags or publishes.
package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/robert-mcdermott/lithosky/internal/scene"
)

var versionPattern = regexp.MustCompile(`^0\.[0-9]+\.[0-9]+(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$`)
var targetList = []string{"darwin/amd64", "darwin/arm64", "linux/amd64", "linux/arm64", "windows/amd64", "windows/arm64"}

type entry struct {
	Name string
	Data []byte
	Mode fs.FileMode
}
type buildInfo struct {
	Version      string `json:"version"`
	Target       string `json:"target"`
	Toolchain    string `json:"toolchain"`
	Revision     string `json:"revision"`
	Dirty        bool   `json:"dirty"`
	BinarySHA256 string `json:"binarySHA256"`
}

// Starter scene file names come from preset IDs.
var presetID = regexp.MustCompile(`^[A-Za-z0-9-]{1,32}$`)

func main() {
	verifyDir := flag.String("verify", "", "verify checksums, archive contents and binary hashes in a package directory")
	version := flag.String("version", "", "package version, e.g. 0.1.0-dev.4")
	out := flag.String("out", "dist/releases", "new output directory (must not exist)")
	targets := flag.String("targets", strings.Join(targetList, ","), "comma-separated OS/architecture targets, or current")
	flag.Parse()
	var err error
	if *verifyDir != "" {
		err = verify(*verifyDir)
	} else {
		err = run(*version, *out, *targets)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
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
func run(version, out, targetOption string) error {
	if !versionPattern.MatchString(version) {
		return errors.New("provide a version such as 0.1.0-dev.4")
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
	if err := os.MkdirAll(filepath.Dir(out), 0755); err != nil {
		return err
	}
	stage, err := os.MkdirTemp(filepath.Dir(out), ".lithosky-release-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	work, err := os.MkdirTemp("", "lithosky-build-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)
	common, err := commonFiles()
	if err != nil {
		return err
	}
	revision, err := command("git", "rev-parse", "HEAD")
	if err != nil {
		return err
	}
	status, err := command("git", "status", "--porcelain")
	if err != nil {
		return err
	}
	toolchain, err := command("go", "version")
	if err != nil {
		return err
	}
	sums := map[string]string{}
	for _, target := range targets {
		parts := strings.Split(target, "/")
		binary := "lithosky"
		if parts[0] == "windows" {
			binary += ".exe"
		}
		built := filepath.Join(work, binary)
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
		data, err := os.ReadFile(built)
		if err != nil {
			return err
		}
		hash := sha256.Sum256(data)
		info := buildInfo{version, target, toolchain, revision, status != "", hex.EncodeToString(hash[:])}
		metadata, err := json.MarshalIndent(info, "", "  ")
		if err != nil {
			return err
		}
		files := append([]entry{}, common...)
		files = append(files, entry{binary, data, 0755}, entry{"BUILD.json", append(metadata, '\n'), 0644})
		base := "lithosky-" + version + "-" + strings.ReplaceAll(target, "/", "-")
		extension := ".tar.gz"
		if parts[0] == "windows" {
			extension = ".zip"
		}
		archive, err := archiveFiles(base, files, parts[0] == "windows")
		if err != nil {
			return err
		}
		name := base + extension
		if err := os.WriteFile(filepath.Join(stage, name), archive, 0644); err != nil {
			return err
		}
		checksum := sha256.Sum256(archive)
		sums[name] = hex.EncodeToString(checksum[:])
		fmt.Println(name)
	}
	names := make([]string, 0, len(sums))
	for name := range sums {
		names = append(names, name)
	}
	sort.Strings(names)
	var manifest strings.Builder
	for _, name := range names {
		fmt.Fprintf(&manifest, "%s  %s\n", sums[name], name)
	}
	if err := os.WriteFile(filepath.Join(stage, "SHA256SUMS"), []byte(manifest.String()), 0644); err != nil {
		return err
	}
	return os.Rename(stage, out)
}
func commonFiles() ([]entry, error) {
	files := []entry{}
	for _, pair := range [][2]string{{"LICENSE", "LICENSE"}, {"NOTICE", "NOTICE"}, {"docs/distribution.md", "README.md"}, {"CHANGELOG.md", "CHANGELOG.md"}} {
		data, err := os.ReadFile(pair[0])
		if err != nil {
			return nil, err
		}
		files = append(files, entry{pair[1], data, 0644})
	}
	goroot, err := command("go", "env", "GOROOT")
	if err != nil {
		return nil, err
	}
	license, err := os.ReadFile(filepath.Join(goroot, "LICENSE"))
	if err != nil {
		return nil, err
	}
	files = append(files, entry{"GO-LICENSE", license, 0644})
	catalog, err := os.ReadFile("web/scenes/presets.json")
	if err != nil {
		return nil, err
	}
	var presets []struct {
		ID    string          `json:"id"`
		Scene json.RawMessage `json:"scene"`
	}
	if err := json.Unmarshal(catalog, &presets); err != nil {
		return nil, err
	}
	if len(presets) == 0 {
		return nil, errors.New("expected starter scenes")
	}
	seen := map[string]bool{}
	for _, preset := range presets {
		if !presetID.MatchString(preset.ID) || seen[preset.ID] {
			return nil, errors.New("invalid starter catalog")
		}
		seen[preset.ID] = true
		if _, err := scene.Validate(preset.Scene); err != nil {
			return nil, err
		}
		var b bytes.Buffer
		if err := json.Indent(&b, preset.Scene, "", "  "); err != nil {
			return nil, err
		}
		b.WriteByte('\n')
		files = append(files, entry{"scenes/" + preset.ID + ".lithosky", b.Bytes(), 0644})
	}
	return files, nil
}
func archiveFiles(base string, files []entry, windows bool) ([]byte, error) {
	files = append([]entry{}, files...)
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	var out bytes.Buffer
	if windows {
		w := zip.NewWriter(&out)
		for _, f := range files {
			h := &zip.FileHeader{Name: base + "/" + f.Name, Method: zip.Deflate}
			h.SetMode(f.Mode)
			h.Modified = time.Date(1980, 1, 1, 0, 0, 0, 0, time.UTC)
			dst, err := w.CreateHeader(h)
			if err != nil {
				return nil, err
			}
			if _, err := dst.Write(f.Data); err != nil {
				return nil, err
			}
		}
		if err := w.Close(); err != nil {
			return nil, err
		}
	} else {
		compressed := gzip.NewWriter(&out)
		w := tar.NewWriter(compressed)
		for _, f := range files {
			if err := w.WriteHeader(&tar.Header{Name: base + "/" + f.Name, Mode: int64(f.Mode.Perm()), Size: int64(len(f.Data)), ModTime: time.Unix(0, 0), Typeflag: tar.TypeReg}); err != nil {
				return nil, err
			}
			if _, err := w.Write(f.Data); err != nil {
				return nil, err
			}
		}
		if err := w.Close(); err != nil {
			return nil, err
		}
		if err := compressed.Close(); err != nil {
			return nil, err
		}
	}
	return out.Bytes(), nil
}
