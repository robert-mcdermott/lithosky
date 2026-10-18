// SPDX-License-Identifier: Apache-2.0
package recovery

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/robert-mcdermott/lithosky/internal/scene"
)

var ErrConflict = errors.New("another tab saved first; download your scene before reloading")
var recordName = regexp.MustCompile(`^([a-f0-9]{32})-([0-9]{12})\.lithosky$`)
var validID = regexp.MustCompile(`^[a-f0-9]{32}$`)

type Record struct {
	ID                string    `json:"id"`
	Title             string    `json:"title"`
	Modified          time.Time `json:"modified"`
	RecoveredPrevious bool      `json:"recoveredPrevious"`
}
type Store struct {
	mu       sync.Mutex
	root     *os.Root
	ID       string
	revision uint64
	last     []byte
	rename   func(string, string) error
}

func New(directory string) (*Store, error) {
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, err
	}
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		root.Close()
		return nil, err
	}
	return &Store{root: root, ID: hex.EncodeToString(id), rename: root.Rename}, nil
}
func (s *Store) Close() error     { return s.root.Close() }
func (s *Store) Revision() uint64 { s.mu.Lock(); defer s.mu.Unlock(); return s.revision }

// Save creates a new immutable generation. A failed/interrupted write never
// replaces the previous valid generation. Each launch has its own ID.
func (s *Store) Save(expected uint64, input []byte) (uint64, error) {
	data, err := scene.Validate(input)
	if err != nil {
		return 0, err
	}
	if err := s.checkAssets(data); err != nil {
		return 0, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if expected != s.revision {
		// Retrying an acknowledged-but-disconnected request is idempotent.
		if expected+1 == s.revision && scene.Equal(data, s.last) {
			return s.revision, nil
		}
		return s.revision, ErrConflict
	}
	next := s.revision + 1
	final := fmt.Sprintf("%s-%012d.lithosky", s.ID, next)
	temp := final + ".pending"
	f, err := s.root.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return s.revision, err
	}
	defer s.root.Remove(temp)
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return s.revision, err
	}
	if err = s.rename(temp, final); err != nil {
		return s.revision, err
	}
	// Directory sync is best effort: it is unsupported on some platforms.
	if directory, err := s.root.Open("."); err == nil {
		_ = directory.Sync()
		_ = directory.Close()
	}
	s.revision, s.last = next, data
	// Keep the current and previous committed snapshots for this launch.
	if next > 2 {
		_ = s.root.Remove(fmt.Sprintf("%s-%012d.lithosky", s.ID, next-2))
	}
	return next, nil
}
func (s *Store) candidates(id string) ([]string, error) {
	entries, err := fs.ReadDir(s.root.FS(), ".")
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.Type().IsRegular() && recordName.MatchString(e.Name()) && (id == "" || strings.HasPrefix(e.Name(), id+"-")) {
			names = append(names, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	return names, nil
}
func (s *Store) read(name string) ([]byte, error) {
	f, err := s.root.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, scene.MaxBytes+1))
	if err != nil {
		return nil, err
	}
	valid, err := scene.Validate(data)
	if err != nil {
		return nil, err
	}
	if err = s.checkAssets(valid); err != nil {
		return nil, err
	}
	return valid, nil
}
func (s *Store) Load(id string) ([]byte, error) {
	if !validID.MatchString(id) {
		return nil, fs.ErrNotExist
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	names, err := s.candidates(id)
	if err != nil {
		return nil, err
	}
	for _, name := range names {
		if data, err := s.read(name); err == nil {
			return data, nil
		}
	}
	return nil, fs.ErrNotExist
}
func (s *Store) List() ([]Record, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	names, err := s.candidates("")
	if err != nil {
		return nil, 0, err
	}
	records := []Record{}
	seen := map[string]bool{}
	damaged := map[string]bool{}
	skipped := 0
	for _, name := range names {
		id := name[:32]
		if seen[id] {
			continue
		}
		data, err := s.read(name)
		if err != nil {
			damaged[id] = true
			skipped++
			continue
		}
		info, err := s.root.Stat(name)
		if err != nil {
			continue
		}
		var doc struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(data, &doc)
		records = append(records, Record{id, doc.Title, info.ModTime(), damaged[id]})
		seen[id] = true
	}
	sort.Slice(records, func(i, j int) bool { return records[i].Modified.After(records[j].Modified) })
	if len(records) > 50 {
		records = records[:50]
	}
	return records, skipped, nil
}
