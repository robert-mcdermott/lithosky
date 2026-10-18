// SPDX-License-Identifier: Apache-2.0
// Fixed-entry archives are read in memory, never extracted to filesystem paths.
package project

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"github.com/robert-mcdermott/lithosky/internal/heightmap"
	"github.com/robert-mcdermott/lithosky/internal/scene"
	"io"
)

func ReadArchive(data []byte, limits map[string]int) (map[string][]byte, error) {
	if len(data) > heightmap.MaxFile {
		return nil, errors.New("archive exceeds 20 MiB")
	}
	// Reject huge entry tables and ZIP64 before archive/zip allocates entry objects.
	end := -1
	for i := len(data) - 22; i >= 0 && i >= len(data)-22-1024; i-- {
		if bytes.Equal(data[i:i+4], []byte{'P', 'K', 5, 6}) && i+22+int(binary.LittleEndian.Uint16(data[i+20:])) == len(data) {
			end = i
			break
		}
	}
	if end < 0 {
		return nil, errors.New("missing bounded ZIP directory")
	}
	e := data[end:]
	if binary.LittleEndian.Uint16(e[4:]) != 0 || binary.LittleEndian.Uint16(e[6:]) != 0 || int(binary.LittleEndian.Uint16(e[8:])) != len(limits) || int(binary.LittleEndian.Uint16(e[10:])) != len(limits) || binary.LittleEndian.Uint32(e[12:]) > 4096 || uint64(binary.LittleEndian.Uint32(e[16:]))+uint64(binary.LittleEndian.Uint32(e[12:])) != uint64(end) {
		return nil, errors.New("unsupported ZIP directory or entry count")
	}
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	if len(r.File) != len(limits) {
		return nil, errors.New("unexpected archive entry count")
	}
	out := map[string][]byte{}
	for _, f := range r.File {
		limit, ok := limits[f.Name]
		if !ok || out[f.Name] != nil || !f.Mode().IsRegular() || f.Flags&1 != 0 || (f.Method != zip.Store && f.Method != zip.Deflate) || f.UncompressedSize64 > uint64(limit) {
			return nil, errors.New("unsafe, duplicate or oversized archive entry")
		}
		stream, err := f.Open()
		if err != nil {
			return nil, err
		}
		b, err := io.ReadAll(io.LimitReader(stream, int64(limit)+1))
		closeErr := stream.Close()
		if err != nil {
			return nil, err
		}
		if closeErr != nil {
			return nil, closeErr
		}
		if len(b) > limit || uint64(len(b)) != f.UncompressedSize64 {
			return nil, errors.New("archive size mismatch")
		}
		out[f.Name] = b
	}
	return out, nil
}
func Archive(names []string, entries map[string][]byte) ([]byte, error) {
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	for _, name := range names {
		h := &zip.FileHeader{Name: name, Method: zip.Store}
		h.SetMode(0600)
		f, err := w.CreateHeader(h)
		if err != nil {
			return nil, err
		}
		if _, err = f.Write(entries[name]); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	if b.Len() > heightmap.MaxFile {
		return nil, errors.New("archive exceeds budget")
	}
	return b.Bytes(), nil
}
func ImportHeightmap(data, metadata []byte) ([]byte, heightmap.Scale, error) {
	if bytes.HasPrefix(data, []byte("PK")) {
		files, err := ReadArchive(data, map[string]int{"height.png": heightmap.MaxFile - 2048, "scale.json": 1024})
		if err != nil {
			return nil, heightmap.Scale{}, err
		}
		data, metadata = files["height.png"], files["scale.json"]
	}
	raw, n, err := heightmap.DecodePNG(data)
	if err != nil {
		return nil, heightmap.Scale{}, err
	}
	scale, err := heightmap.ReadScale(metadata)
	if err != nil {
		return nil, scale, err
	}
	if scale.Resolution != n {
		return nil, scale, errors.New("PNG dimensions differ from scale metadata")
	}
	return raw, scale, nil
}
func ExportHeightmap(raw []byte, scale heightmap.Scale) ([]byte, error) {
	if err := scale.Validate(); err != nil {
		return nil, err
	}
	png, err := heightmap.EncodePNG(raw, scale.Resolution)
	if err != nil {
		return nil, err
	}
	metadata, _ := json.MarshalIndent(scale, "", "  ")
	return Archive([]string{"height.png", "scale.json"}, map[string][]byte{"height.png": png, "scale.json": metadata})
}

// Open returns a fully validated manifest and its optional single immutable asset.
func Open(data []byte) ([]byte, []byte, error) {
	if !bytes.HasPrefix(data, []byte("PK")) {
		doc, err := scene.Validate(data)
		if err != nil {
			return nil, nil, err
		}
		if scene.Asset(doc) != "" {
			return nil, nil, errors.New("heightmap scenes require their portable asset container")
		}
		return doc, nil, nil
	}
	files, err := ReadArchive(data, map[string]int{"scene.json": scene.MaxBytes, "heightmap.bin": heightmap.MaxRaw})
	if err != nil {
		return nil, nil, err
	}
	doc, err := scene.Validate(files["scene.json"])
	if err != nil {
		return nil, nil, err
	}
	raw := files["heightmap.bin"]
	if err = CheckAsset(doc, raw); err != nil {
		return nil, nil, err
	}
	return doc, raw, nil
}
func CheckAsset(doc, raw []byte) error {
	id, n := scene.AssetInfo(doc)
	if id == "" || heightmap.Hash(raw) != id {
		return errors.New("missing or mismatched heightmap checksum")
	}
	return heightmap.ValidateRaw(raw, n)
}
func Save(doc, raw []byte) ([]byte, error) {
	valid, err := scene.Validate(doc)
	if err != nil {
		return nil, err
	}
	if scene.Asset(valid) == "" {
		return valid, nil
	}
	if err = CheckAsset(valid, raw); err != nil {
		return nil, err
	}
	return Archive([]string{"scene.json", "heightmap.bin"}, map[string][]byte{"scene.json": valid, "heightmap.bin": raw})
}
