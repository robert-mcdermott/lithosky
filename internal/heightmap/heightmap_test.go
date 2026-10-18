// SPDX-License-Identifier: Apache-2.0
package heightmap

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"image"
	"image/png"
	"testing"
)

func TestPrecisionAndBudgets(t *testing.T) {
	for _, n := range []int{128, 256, 512, 1024, 2048} {
		raw := make([]byte, 2*(n+1)*(n+1))
		for i := 0; i < len(raw)/2; i++ {
			binary.BigEndian.PutUint16(raw[i*2:], uint16(i))
		}
		encoded, err := EncodePNG(raw, n)
		if err != nil {
			t.Fatal(err)
		}
		decoded, size, err := DecodePNG(encoded)
		if err != nil || size != n || !bytes.Equal(decoded, raw) {
			t.Fatal(n, size, err)
		}
		if len(raw) > MaxRaw {
			t.Fatal("budget")
		}
	}
}
func TestMalformedPNG(t *testing.T) {
	raw := make([]byte, 129*129*2)
	good, _ := EncodePNG(raw, 128)
	var eight bytes.Buffer
	_ = png.Encode(&eight, image.NewGray(image.Rect(0, 0, 129, 129)))
	huge := bytes.Clone(good)
	binary.BigEndian.PutUint32(huge[16:20], 100000)
	binary.BigEndian.PutUint32(huge[29:33], crc32.ChecksumIEEE(huge[12:29]))
	corrupt := bytes.Clone(good)
	corrupt[len(corrupt)-1] ^= 1
	for _, bad := range [][]byte{nil, eight.Bytes(), good[:len(good)-10], corrupt, huge, make([]byte, MaxFile+1)} {
		if _, _, err := DecodePNG(bad); err == nil {
			t.Fatal("accepted malformed PNG")
		}
	}
	if _, err := EncodePNG(raw[:len(raw)-2], 128); err == nil {
		t.Fatal("short raw")
	}
}
func TestScale(t *testing.T) {
	for _, bad := range []string{`{}`, `{"format":"lithosky-heightmap","version":1,"resolution":128,"minimum":2,"maximum":1,"metersPerUnit":1,"elevation":1,"rowOrder":"z-increasing"}`, `{"format":"lithosky-heightmap","version":1,"resolution":128,"minimum":0,"maximum":1,"metersPerUnit":1,"elevation":1,"rowOrder":"z-increasing","path":"../../x"}`} {
		if _, err := ReadScale([]byte(bad)); err == nil {
			t.Fatal("bad scale accepted")
		}
	}
}

func TestRequiredScaleFields(t *testing.T) {
	valid := []byte(`{"format":"lithosky-heightmap","version":1,"resolution":128,"minimum":0,"maximum":0,"metersPerUnit":1,"elevation":1,"rowOrder":"z-increasing"}`)
	if _, err := ReadScale(valid); err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(valid, &fields)
	for name, value := range fields {
		delete(fields, name)
		missing, _ := json.Marshal(fields)
		if _, err := ReadScale(missing); err == nil {
			t.Fatal("accepted missing", name)
		}
		fields[name] = json.RawMessage("null")
		null, _ := json.Marshal(fields)
		if _, err := ReadScale(null); err == nil {
			t.Fatal("accepted null", name)
		}
		fields[name] = value
	}
}
