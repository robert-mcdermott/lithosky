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
