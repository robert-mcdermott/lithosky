// SPDX-License-Identifier: Apache-2.0
package project

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"github.com/robert-mcdermott/lithosky/internal/heightmap"
	"os"
	"testing"
)

func fixture(t testing.TB) ([]byte, []byte, heightmap.Scale) {
	t.Helper()
	raw := make([]byte, 129*129*2)
	for i := range raw {
		raw[i] = byte(i)
	}
	scale := heightmap.Scale{Format: "lithosky-heightmap", Version: 1, Resolution: 128, Minimum: -2, Maximum: 8, MetersPerUnit: 10, Elevation: 1.5, RowOrder: "z-increasing"}
	plain, err := os.ReadFile("../../tests/fixtures/scene.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(plain, &doc); err != nil {
		t.Fatal(err)
	}
	doc["title"] = "Heightmap"
	doc["terrain"].(map[string]any)["heightmap"] = map[string]any{"asset": heightmap.Hash(raw), "resolution": 128}
	b, _ := json.Marshal(doc)
	return b, raw, scale
}
func TestPortableRoundTrip(t *testing.T) {
	doc, raw, scale := fixture(t)
	file, err := Save(doc, raw)
	if err != nil {
		t.Fatal(err)
	}
	got, asset, err := Open(file)
	if err != nil || !bytes.Equal(asset, raw) {
		t.Fatal(err)
	}
	again, err := Save(got, asset)
	if err != nil || !bytes.Equal(file, again) {
		t.Fatal("nondeterministic container", err)
	}
	bundle, err := ExportHeightmap(raw, scale)
	if err != nil {
		t.Fatal(err)
	}
	samples, metadata, err := ImportHeightmap(bundle, nil)
	if err != nil || metadata != scale || !bytes.Equal(samples, raw) {
		t.Fatal("scale/sample roundtrip", err)
	}
	if _, _, err := Open(doc); err == nil {
		t.Fatal("a heightmap scene without its samples opened")
	}
	// A procedural scene saves as plain JSON and reopens unchanged.
	plain, err := os.ReadFile("../../tests/fixtures/scene.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	opened, a, err := Open(plain)
	if err != nil || a != nil {
		t.Fatal(err)
	}
	saved, err := Save(opened, nil)
	if err != nil || !bytes.Equal(opened, saved) {
		t.Fatal("plain scene round trip", err)
	}
}
func TestUnsafeContainers(t *testing.T) {
	doc, raw, _ := fixture(t)
	good, _ := Save(doc, raw)
	for _, name := range []string{"../heightmap.bin", "/heightmap.bin", "a\\heightmap.bin", "nested/heightmap.bin", "heightmap.bin"} {
		var b bytes.Buffer
		w := zip.NewWriter(&b)
		for _, n := range []string{"scene.json", name} {
			h := &zip.FileHeader{Name: n}
			if n == "heightmap.bin" {
				h.SetMode(os.ModeSymlink | 0600)
			}
			f, _ := w.CreateHeader(h)
			if n == "scene.json" {
				_, _ = f.Write(doc)
			} else {
				_, _ = f.Write(raw)
			}
		}
		_ = w.Close()
		if _, _, err := Open(b.Bytes()); err == nil {
			t.Fatal("unsafe entry", name)
		}
	}
	duplicate, _ := Archive([]string{"scene.json", "scene.json"}, map[string][]byte{"scene.json": doc})
	missing, _ := Archive([]string{"scene.json"}, map[string][]byte{"scene.json": doc})
	wrong := bytes.Clone(raw)
	wrong[0] ^= 1
	hashMismatch, _ := Archive([]string{"scene.json", "heightmap.bin"}, map[string][]byte{"scene.json": doc, "heightmap.bin": wrong})
	var bomb bytes.Buffer
	z := zip.NewWriter(&bomb)
	f, _ := z.Create("scene.json")
	_, _ = f.Write(make([]byte, 128*1024+1))
	f, _ = z.Create("heightmap.bin")
	_, _ = f.Write(raw)
	_ = z.Close()
	for _, bad := range [][]byte{good[:len(good)-1], duplicate, missing, hashMismatch, bomb.Bytes(), make([]byte, heightmap.MaxFile+1)} {
		if _, _, err := Open(bad); err == nil {
			t.Fatal("bad container accepted")
		}
	}
}

func TestDirectoryAndChecksums(t *testing.T) {
	doc, raw, _ := fixture(t)
	valid, _ := Save(doc, raw)
	crc := bytes.Clone(valid)
	crc[30+len("scene.json")+12] ^= 1
	entries := bytes.Clone(valid)
	entries[len(entries)-22+8] = 255
	entries[len(entries)-22+9] = 255
	for _, data := range [][]byte{crc, entries} {
		if _, _, err := Open(data); err == nil {
			t.Fatal("corrupt archive accepted")
		}
	}
	bundle, _ := ExportHeightmap(raw, heightmap.Scale{Format: "lithosky-heightmap", Version: 1, Resolution: 128, Minimum: 0, Maximum: 8, MetersPerUnit: 1, Elevation: 1, RowOrder: "z-increasing"})
	files, _ := ReadArchive(bundle, map[string]int{"height.png": heightmap.MaxFile - 2048, "scale.json": 1024})
	files["scale.json"] = bytes.Replace(files["scale.json"], []byte("128"), []byte("256"), 1)
	bad, _ := Archive([]string{"height.png", "scale.json"}, files)
	if _, _, err := ImportHeightmap(bad, nil); err == nil {
		t.Fatal("dimension metadata mismatch accepted")
	}
}
func FuzzOpen(f *testing.F) {
	doc, raw, _ := fixture(f)
	valid, _ := Save(doc, raw)
	f.Add(valid)
	f.Add([]byte("PKbroken"))
	f.Add([]byte(`{"version":1}`))
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > heightmap.MaxFile {
			t.Skip()
		}
		doc, raw, err := Open(data)
		if err == nil {
			saved, err := Save(doc, raw)
			if err != nil {
				t.Fatal(err)
			}
			if _, _, err = Open(saved); err != nil {
				t.Fatal(err)
			}
		}
	})
}
