// SPDX-License-Identifier: Apache-2.0
package scene

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestSharedFixtures(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/scenes.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name  string
		Valid bool
		Scene json.RawMessage
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			result, err := Validate(f.Scene)
			if (err == nil) != f.Valid {
				t.Fatalf("valid=%v: %v", f.Valid, err)
			}
			if f.Valid {
				second, err := Validate(result)
				if err != nil || !Equal(result, second) {
					t.Fatal("round trip changed canonical data")
				}
			}
		})
	}
}

func TestInvalidDocuments(t *testing.T) {
	for _, data := range [][]byte{
		[]byte(`{"version":1,`),
		[]byte(`{} {}`),
		[]byte(`{"version":1,"title":1e999}`),
		{0xff},
		bytes.Repeat([]byte(" "), MaxBytes+1),
	} {
		if _, err := Validate(data); err == nil {
			t.Fatalf("accepted invalid document %q", data[:min(len(data), 24)])
		}
	}
}

func TestOldVersionsExplained(t *testing.T) {
	_, err := Validate([]byte(`{"format":"lithosky","version":13,"title":"Old"}`))
	if err == nil || !strings.Contains(err.Error(), "version 1") {
		t.Fatalf("expected a version message, got %v", err)
	}
}

func TestPresetsValidate(t *testing.T) {
	data, err := os.ReadFile("../../web/scenes/presets.json")
	if err != nil {
		t.Fatal(err)
	}
	var presets []struct {
		ID    string          `json:"id"`
		Scene json.RawMessage `json:"scene"`
	}
	if err := json.Unmarshal(data, &presets); err != nil {
		t.Fatal(err)
	}
	if len(presets) == 0 {
		t.Fatal("no presets")
	}
	for _, preset := range presets {
		if _, err := Validate(preset.Scene); err != nil {
			t.Errorf("%s: %v", preset.ID, err)
		}
	}
}

func TestAssetInfo(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/scene.lithosky")
	if err != nil {
		t.Fatal(err)
	}
	if id, _ := AssetInfo(data); id != "" {
		t.Fatalf("procedural scene reported asset %q", id)
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	asset := strings.Repeat("b", 64)
	doc["terrain"].(map[string]any)["heightmap"] = map[string]any{"asset": asset, "resolution": 1024}
	withMap, _ := json.Marshal(doc)
	if _, err := Validate(withMap); err != nil {
		t.Fatal(err)
	}
	if id, n := AssetInfo(withMap); id != asset || n != 1024 {
		t.Fatalf("AssetInfo = %q, %d", id, n)
	}
}
