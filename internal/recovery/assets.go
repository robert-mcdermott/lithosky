// SPDX-License-Identifier: Apache-2.0
package recovery

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"github.com/robert-mcdermott/lithosky/internal/heightmap"
	"github.com/robert-mcdermott/lithosky/internal/scene"
	"io"
	"math"
	"os"
)

// Content-addressed immutable assets are retained for undo and older snapshots.
// No archive-controlled name is ever used on disk, and no automatic GC deletes
// assets that another process or recovery generation may still reference.
func (s *Store) PutAsset(data []byte) (string, error) {
	n := int(math.Sqrt(float64(len(data)/2))) - 1
	if err := heightmap.ValidateRaw(data, n); err != nil {
		return "", err
	}
	id := heightmap.Hash(data)
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.GetAsset(id); err == nil {
		return id, nil
	}
	name := "height-" + id + ".bin"
	// Existing corrupt assets are not silently replaced.
	if _, err := s.root.Lstat(name); err == nil {
		return "", errors.New("existing heightmap asset is damaged")
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	temp := name + "-" + hex.EncodeToString(random) + ".pending"
	f, err := s.root.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return "", err
	}
	defer s.root.Remove(temp)
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closed := f.Close()
	if err == nil {
		err = closed
	}
	if err != nil {
		return "", err
	}
	if err = s.root.Rename(temp, name); err != nil {
		return "", err
	}
	if d, err := s.root.Open("."); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return id, nil
}
func (s *Store) GetAsset(id string) ([]byte, error) {
	if !heightmap.ValidHash(id) {
		return nil, errors.New("invalid heightmap reference")
	}
	name := "height-" + id + ".bin"
	info, err := s.root.Lstat(name)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > heightmap.MaxRaw {
		return nil, errors.New("invalid heightmap asset")
	}
	f, err := s.root.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, heightmap.MaxRaw+1))
	if err != nil {
		return nil, err
	}
	if len(data) > heightmap.MaxRaw || heightmap.Hash(data) != id {
		return nil, errors.New("heightmap checksum mismatch")
	}
	return data, nil
}
func (s *Store) checkAssets(data []byte) error {
	id, n := scene.AssetInfo(data)
	if id == "" {
		return nil
	}
	raw, err := s.GetAsset(id)
	if err != nil {
		return err
	}
	return heightmap.ValidateRaw(raw, n)
}
