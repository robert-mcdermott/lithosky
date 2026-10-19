// SPDX-License-Identifier: Apache-2.0
package recovery

import (
	"bytes"
	"encoding/json"
	"github.com/robert-mcdermott/lithosky/internal/scene"
	"os"
	"path/filepath"
	"testing"
)

func TestAssetRecoveryAndDamage(t *testing.T) {
	root := t.TempDir()
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	raw := make([]byte, 129*129*2)
	id, err := s.PutAsset(raw)
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.PutAsset(raw)
	if err != nil || id != again {
		t.Fatal(err)
	}
	legacy, err := os.ReadFile("../../tests/fixtures/legacy.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	_ = json.Unmarshal(legacy, &doc)
	doc["version"] = 5
	doc["terrain"] = map[string]any{"generator": "heightmap-v1", "seed": 1847, "elevation": 1, "palette": "natural", "resolution": 128, "sculpt": []any{}, "asset": id, "minimum": 0, "maximum": 8, "metersPerUnit": 1}
	data, _ := json.Marshal(doc)
	if _, err = s.Save(0, legacy); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Save(1, data); err != nil {
		t.Fatal(err)
	}
	session := s.ID
	_ = s.Close()
	s, err = New(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	loaded, err := s.Load(session)
	canonical, _ := scene.Validate(data)
	if err != nil || !bytes.Equal(loaded, canonical) {
		t.Fatal("restart scene", err)
	}
	sample, err := s.GetAsset(id)
	if err != nil || !bytes.Equal(sample, raw) {
		t.Fatal("restart asset", err)
	}
	if err = os.WriteFile(filepath.Join(root, "height-"+id+".bin"), []byte("damaged"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetAsset(id); err == nil {
		t.Fatal("damaged asset accepted")
	}
	if _, err = s.Save(0, data); err == nil {
		t.Fatal("dangling reference saved")
	}
	fallback, err := s.Load(session)
	canonical, _ = scene.Validate(legacy)
	if err != nil || !bytes.Equal(fallback, canonical) {
		t.Fatal("did not fall back to valid legacy snapshot", err)
	}
	for _, bad := range []string{"../x", id + "/x", ""} {
		if _, err = s.GetAsset(bad); err == nil {
			t.Fatal("unsafe ID")
		}
	}
}

func TestEntityAssetRecovery(t *testing.T) {
	root := t.TempDir()
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	raw := make([]byte, 129*129*2)
	for i := range raw {
		raw[i] = byte(i % 251)
	}
	id, err := s.PutAsset(raw)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile("../../docs/site/assets/editable-basin.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err = json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	for _, item := range doc["entities"].([]any) {
		components := item.(map[string]any)["components"].(map[string]any)
		if components["terrain"] != nil {
			components["terrain"] = map[string]any{"generator": "heightmap-v1", "seed": 1847, "elevation": 1, "palette": "natural", "resolution": 128, "sculpt": []any{}, "asset": id, "minimum": 0, "maximum": 8, "metersPerUnit": 1}
		}
	}
	data, err = json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := scene.Validate(data)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Save(0, data); err != nil {
		t.Fatal(err)
	}
	session := s.ID
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = New(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	loaded, err := s.Load(session)
	if err != nil || !bytes.Equal(loaded, canonical) {
		t.Fatal("entity graph recovery changed the document", err)
	}
	samples, err := s.GetAsset(id)
	if err != nil || !bytes.Equal(samples, raw) {
		t.Fatal("entity terrain asset recovery changed samples", err)
	}
}
