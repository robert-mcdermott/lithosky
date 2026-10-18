// SPDX-License-Identifier: Apache-2.0
package heightmap

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"io"
	"math"
)

const MaxRaw = 2049 * 2049 * 2
const MaxFile = 20 * 1024 * 1024

type Scale struct {
	Format        string  `json:"format"`
	Version       int     `json:"version"`
	Resolution    int     `json:"resolution"`
	Minimum       float64 `json:"minimum"`
	Maximum       float64 `json:"maximum"`
	MetersPerUnit float64 `json:"metersPerUnit"`
	Elevation     float64 `json:"elevation"`
	RowOrder      string  `json:"rowOrder"`
}

func Resolution(n int) bool { return n == 128 || n == 256 || n == 512 || n == 1024 || n == 2048 }
func (s Scale) Validate() error {
	if s.Format != "lithosky-heightmap" || s.Version != 1 || !Resolution(s.Resolution) || s.RowOrder != "z-increasing" || !finite(s.Minimum, -64, 64) || !finite(s.Maximum, s.Minimum, 64) || !finite(s.MetersPerUnit, .001, 100000) || !finite(s.Elevation, .4, 1.7) {
		return errors.New("invalid heightmap scale metadata")
	}
	return nil
}
func finite(v, lo, hi float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= lo && v <= hi }
func ReadScale(data []byte) (Scale, error) {
	var s Scale
	if len(data) > 1024 {
		return s, errors.New("scale metadata too large")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return s, err
	}
	for _, name := range []string{"format", "version", "resolution", "minimum", "maximum", "metersPerUnit", "elevation", "rowOrder"} {
		if value, ok := fields[name]; !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return s, errors.New("missing scale field: " + name)
		}
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&s); err != nil {
		return s, err
	}
	if d.Decode(new(any)) != io.EOF {
		return s, errors.New("trailing scale metadata")
	}
	return s, s.Validate()
}
func Hash(data []byte) string { s := sha256.Sum256(data); return hex.EncodeToString(s[:]) }
func ValidHash(id string) bool {
	if len(id) != 64 {
		return false
	}
	for _, c := range id {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
func ValidateRaw(data []byte, n int) error {
	if !Resolution(n) || len(data) != 2*(n+1)*(n+1) {
		return errors.New("height sample length does not match resolution")
	}
	return nil
}
func DecodePNG(data []byte) ([]byte, int, error) {
	if len(data) > MaxFile || len(data) < 33 || !bytes.Equal(data[:8], []byte{137, 80, 78, 71, 13, 10, 26, 10}) || data[24] != 16 || data[25] != 0 {
		return nil, 0, errors.New("choose a 16-bit grayscale PNG without alpha")
	}
	cfg, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, 0, err
	}
	if cfg.Width != cfg.Height || !Resolution(cfg.Width-1) {
		return nil, 0, errors.New("heightmaps must be square: 129, 257, 513, 1025 or 2049 samples per side")
	}
	// Bound allocation before decoding. Raw sample values are elevation, not colors;
	// no browser canvas, gamma conversion, RGB conversion or alpha is accepted.
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, 0, err
	}
	gray, ok := img.(*image.Gray16)
	if !ok {
		return nil, 0, errors.New("heightmap transparency is not supported")
	}
	raw := make([]byte, cfg.Width*cfg.Height*2)
	for y := 0; y < cfg.Height; y++ {
		copy(raw[y*cfg.Width*2:], gray.Pix[y*gray.Stride:y*gray.Stride+cfg.Width*2])
	}
	return raw, cfg.Width - 1, nil
}
func EncodePNG(data []byte, n int) ([]byte, error) {
	if err := ValidateRaw(data, n); err != nil {
		return nil, err
	}
	img := &image.Gray16{Pix: data, Stride: (n + 1) * 2, Rect: image.Rect(0, 0, n+1, n+1)}
	var b bytes.Buffer
	err := png.Encode(&b, img)
	return b.Bytes(), err
}
