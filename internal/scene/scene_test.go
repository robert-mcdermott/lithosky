// SPDX-License-Identifier: Apache-2.0
package scene

import (
	"bytes"
	"encoding/json"
	"os"
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
	for _, data := range [][]byte{[]byte(`{"version":1,`), []byte(`{} {}`), []byte(`{"version":1,"title":1e999}`), {0xff}, bytes.Repeat([]byte(" "), MaxBytes+1)} {
		if _, err := Validate(data); err == nil {
			t.Fatal("accepted invalid document")
		}
	}
}

func TestCameraCompositions(t *testing.T) {
	data, err := os.ReadFile("../../web/scenes/compositions.json")
	if err != nil {
		t.Fatal(err)
	}
	var studies []struct {
		ID    string          `json:"id"`
		Scene json.RawMessage `json:"scene"`
	}
	if err := json.Unmarshal(data, &studies); err != nil {
		t.Fatal(err)
	}
	for _, study := range studies {
		t.Run(study.ID, func(t *testing.T) {
			valid, err := Validate(study.Scene)
			if err != nil {
				t.Fatal(err)
			}
			second, err := Validate(valid)
			if err != nil || !Equal(valid, second) {
				t.Fatal("v10 round trip changed scene")
			}
			var doc map[string]any
			if err := json.Unmarshal(valid, &doc); err != nil {
				t.Fatal(err)
			}
			lens := doc["camera"].(map[string]any)["lens"].(map[string]any)
			for key, value := range map[string]any{"frame": "4:5", "fNumber": 0.1, "focusDistance": 0.0, "roll": 181.0, "metresPerUnit": 0.0} {
				before := lens[key]
				lens[key] = value
				invalid, _ := json.Marshal(doc)
				if _, err := Validate(invalid); err == nil {
					t.Fatalf("accepted invalid lens %s", key)
				}
				lens[key] = before
			}
		})
	}
}

func TestEntityFixtures(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/entities.json")
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
			valid, err := Validate(f.Scene)
			if (err == nil) != f.Valid {
				t.Fatalf("valid=%v: %v", f.Valid, err)
			}
			if f.Valid {
				again, err := Validate(valid)
				if err != nil || !Equal(valid, again) {
					t.Fatal("entity round trip changed scene", err)
				}
			}
		})
	}
}

func TestSpatialFixtures(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/spatial.json")
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
			valid, err := Validate(f.Scene)
			if (err == nil) != f.Valid {
				t.Fatalf("valid=%v: %v", f.Valid, err)
			}
			if f.Valid {
				again, err := Validate(valid)
				if err != nil || !Equal(valid, again) {
					t.Fatal("entity round trip changed scene", err)
				}
			}
		})
	}
}

func TestCompositionFixtures(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/composition.json")
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
			valid, err := Validate(f.Scene)
			if (err == nil) != f.Valid {
				t.Fatalf("valid=%v: %v", f.Valid, err)
			}
			if f.Valid {
				again, err := Validate(valid)
				if err != nil || !Equal(valid, again) {
					t.Fatal("composition round trip changed scene", err)
				}
			}
		})
	}
}
