// SPDX-License-Identifier: Apache-2.0
package recovery

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func fixture(t *testing.T, seed int) []byte {
	t.Helper()
	data, err := os.ReadFile("../../tests/fixtures/scenes.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct{ Scene json.RawMessage }
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	return []byte(strings.Replace(string(fixtures[0].Scene), `"seed": 1847`, fmt.Sprintf(`"seed": %d`, seed), 1))
}
func TestInterruptedSaveAndRestart(t *testing.T) {
	directory := t.TempDir()
	store, err := New(directory)
	if err != nil {
		t.Fatal(err)
	}
	first := fixture(t, 123)
	if _, err := store.Save(0, first); err != nil {
		t.Fatal(err)
	}
	originalRename := store.rename
	store.rename = func(string, string) error { return errors.New("injected failure before publish") }
	if _, err := store.Save(1, fixture(t, 456)); err == nil {
		t.Fatal("expected write failure")
	}
	store.rename = originalRename
	id := store.ID
	store.Close()
	// A leftover partially written temp file from a killed process is never loaded.
	os.WriteFile(filepath.Join(directory, id+"-000000000002.lithosky.pending"), []byte("{"), 0600)
	restarted, err := New(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	loaded, err := restarted.Load(id)
	if err != nil || !strings.Contains(string(loaded), `"seed":123`) {
		t.Fatalf("prior valid snapshot lost: %s %v", loaded, err)
	}
	// A corrupt published generation falls back to its previous valid snapshot.
	os.WriteFile(filepath.Join(directory, id+"-000000000002.lithosky"), []byte("{"), 0600)
	records, skipped, err := restarted.List()
	if err != nil || skipped != 1 || len(records) != 1 || !records[0].RecoveredPrevious {
		t.Fatalf("recovery listing: %+v %d %v", records, skipped, err)
	}
	loaded, err = restarted.Load(id)
	if err != nil || !strings.Contains(string(loaded), `"seed":123`) {
		t.Fatal("failed corrupt-snapshot fallback")
	}
}
func TestConflictRetentionAndValidation(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	for i := uint64(0); i < 4; i++ {
		if _, err := store.Save(i, fixture(t, int(i))); err != nil {
			t.Fatal(err)
		}
	}
	names, _ := store.candidates(store.ID)
	if len(names) != 2 {
		t.Fatalf("retained %d snapshots", len(names))
	}
	if revision, err := store.Save(3, fixture(t, 3)); err != nil || revision != 4 {
		t.Fatal("idempotent retry failed")
	}
	if _, err := store.Save(3, fixture(t, 99)); !errors.Is(err, ErrConflict) {
		t.Fatal("stale write allowed")
	}
	if _, err := store.Save(4, []byte(`{}`)); err == nil {
		t.Fatal("invalid scene allowed")
	}
	if store.Revision() != 4 {
		t.Fatal("failed write changed revision")
	}
	if _, err := store.Load("../secret"); err == nil {
		t.Fatal("path accepted")
	}
}
func TestConcurrentTabs(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	a, b := fixture(t, 1), fixture(t, 2)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, data := range [][]byte{a, b} {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := store.Save(0, data); results <- err }()
	}
	wg.Wait()
	close(results)
	successes, conflicts := 0, 0
	for err := range results {
		if err == nil {
			successes++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatal("concurrent writes did not conflict")
	}
}
