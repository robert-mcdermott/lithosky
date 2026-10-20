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
	plain, err := os.ReadFile("../../tests/fixtures/scene.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	_ = json.Unmarshal(plain, &doc)
	doc["terrain"].(map[string]any)["heightmap"] = map[string]any{"asset": id, "resolution": 128}
	data, _ := json.Marshal(doc)
	if _, err = s.Save(0, plain); err != nil {
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
	canonical, _ = scene.Validate(plain)
	if err != nil || !bytes.Equal(fallback, canonical) {
		t.Fatal("did not fall back to the valid earlier snapshot", err)
	}
	for _, bad := range []string{"../x", id + "/x", ""} {
		if _, err = s.GetAsset(bad); err == nil {
			t.Fatal("unsafe ID")
		}
	}
}
