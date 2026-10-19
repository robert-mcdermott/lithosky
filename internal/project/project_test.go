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
	doc := map[string]any{"format": "lithosky", "version": 5, "title": "Heightmap", "terrain": map[string]any{"generator": "heightmap-v1", "seed": 1847, "elevation": 1.5, "palette": "natural", "resolution": 128, "sculpt": []any{}, "asset": heightmap.Hash(raw), "minimum": -2, "maximum": 8, "metersPerUnit": 10}, "camera": map[string]any{"yaw": .28, "pitch": .3, "distance": 23}, "water": map[string]any{"enabled": true, "level": .25}, "lighting": map[string]any{"sunElevation": 38}}
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
		t.Fatal("metadata-only v5 opened")
	}
	// Opening and saving a v1 starter preserves its version and parameters.
	legacy, err := os.ReadFile("../../tests/fixtures/legacy.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	v1, a, err := Open(legacy)
	if err != nil || a != nil {
		t.Fatal(err)
	}
	saved, err := Save(v1, nil)
	if err != nil || !bytes.Equal(v1, saved) {
		t.Fatal("v1 migration", err)
	}
}
func TestLakePortableRoundTrip(t *testing.T) {
	doc, raw, _ := fixture(t)
	var imported map[string]any
	if err := json.Unmarshal(doc, &imported); err != nil {
		t.Fatal(err)
	}
	current, err := os.ReadFile("../../docs/site/assets/silver-basin.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	var lake map[string]any
	if err := json.Unmarshal(current, &lake); err != nil {
		t.Fatal(err)
	}
	lake["terrain"] = imported["terrain"]
	doc, err = json.Marshal(lake)
	if err != nil {
		t.Fatal(err)
	}
	file, err := Save(doc, raw)
	if err != nil {
		t.Fatal(err)
	}
	got, asset, err := Open(file)
	if err != nil || !bytes.Equal(asset, raw) || !bytes.Equal(got, doc) {
		t.Fatal("v9 optics or samples changed in portable scene", err)
	}
	again, err := Save(got, asset)
	if err != nil || !bytes.Equal(file, again) {
		t.Fatal("nondeterministic v9 container", err)
	}
}
func TestCameraPortableRoundTrip(t *testing.T) {
	doc, raw, _ := fixture(t)
	var imported map[string]any
	if err := json.Unmarshal(doc, &imported); err != nil {
		t.Fatal(err)
	}
	current, err := os.ReadFile("../../docs/site/assets/snow-composition.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	var camera map[string]any
	if err := json.Unmarshal(current, &camera); err != nil {
		t.Fatal(err)
	}
	camera["terrain"] = imported["terrain"]
	doc, err = json.Marshal(camera)
	if err != nil {
		t.Fatal(err)
	}
	file, err := Save(doc, raw)
	if err != nil {
		t.Fatal(err)
	}
	got, asset, err := Open(file)
	if err != nil || !bytes.Equal(asset, raw) || !bytes.Equal(got, doc) {
		t.Fatal("v10 camera or imported samples changed", err)
	}
	again, err := Save(got, asset)
	if err != nil || !bytes.Equal(file, again) {
		t.Fatal("nondeterministic v10 container", err)
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
