// SPDX-License-Identifier: Apache-2.0
package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

func TestArchives(t *testing.T) {
	files := []entry{{"lithosky", []byte("executable"), 0755}, {"LICENSE", []byte("license"), 0644}, {"scenes/a.lithosky", []byte("{}"), 0644}}
	for _, windows := range []bool{false, true} {
		a, err := archiveFiles("lithosky-test", files, windows)
		if err != nil {
			t.Fatal(err)
		}
		b, err := archiveFiles("lithosky-test", files, windows)
		if err != nil || !bytes.Equal(a, b) {
			t.Fatal("nondeterministic archive")
		}
		count := 0
		if windows {
			r, err := zip.NewReader(bytes.NewReader(a), int64(len(a)))
			if err != nil {
				t.Fatal(err)
			}
			for _, f := range r.File {
				count++
				if f.Name == "lithosky-test/lithosky" && f.Mode().Perm() != 0755 {
					t.Fatal("executable permission lost")
				}
				reader, err := f.Open()
				if err != nil {
					t.Fatal(err)
				}
				data, err := io.ReadAll(reader)
				reader.Close()
				if err != nil || len(data) == 0 {
					t.Fatal("empty member")
				}
			}
		} else {
			gz, err := gzip.NewReader(bytes.NewReader(a))
			if err != nil {
				t.Fatal(err)
			}
			defer gz.Close()
			r := tar.NewReader(gz)
			for {
				h, err := r.Next()
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Fatal(err)
				}
				count++
				if h.Name == "lithosky-test/lithosky" && h.Mode != 0755 {
					t.Fatal("executable permission lost")
				}
				data, err := io.ReadAll(r)
				if err != nil || len(data) == 0 {
					t.Fatal("empty member")
				}
			}
		}
		if count != len(files) {
			t.Fatal("archive missing members")
		}
	}
}
func TestTargetValidation(t *testing.T) {
	for _, value := range []string{"", "darwin/arm64,darwin/arm64", "../escape", "linux/386"} {
		if _, err := parseTargets(value); err == nil {
			t.Fatal("accepted", value)
		}
	}
	if _, err := parseTargets("current"); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyDetectsChangedBinaryAndMissingNotices(t *testing.T) {
	original, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir("../.."); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(original)
	common, err := commonFiles()
	if err != nil {
		t.Fatal(err)
	}
	binary := []byte("a test executable")
	sum := sha256.Sum256(binary)
	for _, target := range []string{"linux/amd64", "windows/arm64"} {
		windows := strings.HasPrefix(target, "windows/")
		name := "lithosky"
		suffix := ".tar.gz"
		if windows {
			name += ".exe"
			suffix = ".zip"
		}
		info := buildInfo{Version: "0.1.0-dev.4", Target: target, BinarySHA256: hex.EncodeToString(sum[:])}
		metadata, _ := json.Marshal(info)
		files := append([]entry{}, common...)
		files = append(files, entry{name, binary, 0755}, entry{"BUILD.json", metadata, 0644})
		base := "lithosky-0.1.0-dev.4-" + strings.ReplaceAll(target, "/", "-")
		archive, err := archiveFiles(base, files, windows)
		if err != nil {
			t.Fatal(err)
		}
		if err := verifyArchive(base+suffix, archive); err != nil {
			t.Fatal(err)
		}
		files[len(files)-2].Data = []byte("tampered")
		archive, _ = archiveFiles(base, files, windows)
		if err := verifyArchive(base+suffix, archive); err == nil {
			t.Fatal("accepted changed executable")
		}
		files[len(files)-2].Data = binary
		archive, _ = archiveFiles(base, files[1:], windows)
		if err := verifyArchive(base+suffix, archive); err == nil {
			t.Fatal("accepted missing notice")
		}
	}
}
