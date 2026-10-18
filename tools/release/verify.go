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
	"errors"
	"fmt"
	"github.com/robert-mcdermott/lithosky/internal/scene"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func verify(directory string) error {
	sums, err := os.ReadFile(filepath.Join(directory, "SHA256SUMS"))
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, line := range strings.Split(strings.TrimSpace(string(sums)), "\n") {
		parts := strings.Fields(line)
		if len(parts) != 2 || len(parts[0]) != 64 || filepath.Base(parts[1]) != parts[1] || seen[parts[1]] {
			return errors.New("invalid checksum manifest")
		}
		name := parts[1]
		seen[name] = true
		info, err := os.Stat(filepath.Join(directory, name))
		if err != nil {
			return err
		}
		if info.Size() > 128<<20 {
			return errors.New("archive exceeds verification budget")
		}
		data, err := os.ReadFile(filepath.Join(directory, name))
		if err != nil {
			return err
		}
		sum := sha256.Sum256(data)
		if hex.EncodeToString(sum[:]) != parts[0] {
			return fmt.Errorf("checksum mismatch: %s", name)
		}
		if err := verifyArchive(name, data); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		fmt.Println("Verified", name)
	}
	if len(seen) < 1 || len(seen) > 6 {
		return errors.New("expected 1–6 archives")
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if (strings.HasSuffix(entry.Name(), ".zip") || strings.HasSuffix(entry.Name(), ".tar.gz")) && !seen[entry.Name()] {
			return errors.New("archive missing from checksums: " + entry.Name())
		}
	}
	return nil
}
func verifyArchive(name string, data []byte) error {
	windows := strings.HasSuffix(name, ".zip")
	suffix := ".tar.gz"
	if windows {
		suffix = ".zip"
	}
	if !strings.HasSuffix(name, suffix) {
		return errors.New("unsupported archive type")
	}
	base := strings.TrimSuffix(name, suffix)
	members := map[string][]byte{}
	modes := map[string]uint32{}
	var total int64
	add := func(name string, size int64, mode uint32, reader io.Reader) error {
		if !strings.HasPrefix(name, base+"/") || size < 0 || size > 64<<20 {
			return errors.New("invalid member")
		}
		relative := strings.TrimPrefix(name, base+"/")
		if members[relative] != nil {
			return errors.New("duplicate member")
		}
		total += size
		if total > 128<<20 {
			return errors.New("archive expands beyond budget")
		}
		content, err := io.ReadAll(io.LimitReader(reader, size+1))
		if err != nil {
			return err
		}
		if int64(len(content)) != size {
			return errors.New("member size mismatch")
		}
		members[relative] = content
		modes[relative] = mode
		return nil
	}
	if windows {
		r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return err
		}
		for _, f := range r.File {
			if !f.Mode().IsRegular() {
				return errors.New("nonregular archive member")
			}
			reader, err := f.Open()
			if err != nil {
				return err
			}
			err = add(f.Name, int64(f.UncompressedSize64), uint32(f.Mode().Perm()), reader)
			reader.Close()
			if err != nil {
				return err
			}
		}
	} else {
		gz, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return err
		}
		defer gz.Close()
		r := tar.NewReader(gz)
		for {
			h, err := r.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return err
			}
			if h.Typeflag != tar.TypeReg {
				return errors.New("nonregular archive member")
			}
			if err := add(h.Name, h.Size, uint32(h.Mode), r); err != nil {
				return err
			}
		}
		// Consume to the gzip trailer, so CRC errors cannot hide behind tar EOF.
		if _, err := io.Copy(io.Discard, io.LimitReader(gz, 1<<20)); err != nil {
			return err
		}
	}
	var info buildInfo
	if err := json.Unmarshal(members["BUILD.json"], &info); err != nil {
		return err
	}
	if !versionPattern.MatchString(info.Version) || base != "lithosky-"+info.Version+"-"+strings.ReplaceAll(info.Target, "/", "-") {
		return errors.New("build metadata does not match archive name")
	}
	if targets, err := parseTargets(info.Target); err != nil || len(targets) != 1 {
		return errors.New("invalid archive target")
	}
	if windows != strings.HasPrefix(info.Target, "windows/") {
		return errors.New("wrong archive format for platform")
	}
	binary := "lithosky"
	if windows {
		binary += ".exe"
	}
	hash := sha256.Sum256(members[binary])
	if len(members[binary]) == 0 || hex.EncodeToString(hash[:]) != info.BinarySHA256 || modes[binary] != 0755 {
		return errors.New("binary hash or executable mode mismatch")
	}
	for _, name := range []string{"LICENSE", "NOTICE", "GO-LICENSE", "README.md", "CHANGELOG.md"} {
		if len(members[name]) < 20 {
			return errors.New("missing notice/document: " + name)
		}
	}
	for _, id := range []string{"alpine", "highland", "distant"} {
		if _, err := scene.Validate(members["scenes/"+id+".lithosky"]); err != nil {
			return err
		}
	}
	if len(members) != 10 {
		return errors.New("unexpected archive contents")
	}
	return nil
}
