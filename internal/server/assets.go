// SPDX-License-Identifier: Apache-2.0
package server

import (
	"github.com/robert-mcdermott/lithosky/internal/heightmap"
	"github.com/robert-mcdermott/lithosky/internal/project"
	"github.com/robert-mcdermott/lithosky/internal/scene"
	"io"
	"net/http"
	"strings"
)

func (p *Persistence) assets(w http.ResponseWriter, r *http.Request) {
	// Serialize large decodes/archives before reading their bounded bodies.
	p.assetMu.Lock()
	defer p.assetMu.Unlock()
	fail := func(err error) { http.Error(w, err.Error(), http.StatusBadRequest) }
	if strings.HasPrefix(r.URL.Path, "/api/heightmaps/") {
		if r.Method != "GET" {
			method(w, "GET")
			return
		}
		raw, err := p.Store.GetAsset(strings.TrimPrefix(r.URL.Path, "/api/heightmaps/"))
		if err != nil {
			http.Error(w, "heightmap asset missing or damaged", 404)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(raw)
		return
	}
	if r.Method != "POST" {
		method(w, "POST")
		return
	}
	if r.Header.Get("Origin") != "http://"+r.Host {
		http.Error(w, "same-origin write required", 403)
		return
	}
	limit := int64(heightmap.MaxFile)
	if r.URL.Path == "/api/project/save" {
		limit = scene.MaxBytes
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		http.Error(w, "file exceeds size limit", 413)
		return
	}
	var output []byte
	switch r.URL.Path {
	case "/api/heightmap/import":
		raw, scale, err := project.ImportHeightmap(body, []byte(r.Header.Get("X-Lithosky-Scale")))
		if err != nil {
			fail(err)
			return
		}
		id, err := p.Store.PutAsset(raw)
		if err != nil {
			http.Error(w, "could not store heightmap asset", 500)
			return
		}
		jsonReply(w, map[string]any{"asset": id, "scale": scale})
		return
	case "/api/heightmap/export":
		scale, err := heightmap.ReadScale([]byte(r.Header.Get("X-Lithosky-Scale")))
		if err != nil {
			fail(err)
			return
		}
		output, err = project.ExportHeightmap(body, scale)
		if err != nil {
			fail(err)
			return
		}
	case "/api/project/open":
		doc, raw, err := project.Open(body)
		if err != nil {
			fail(err)
			return
		}
		if raw != nil {
			if _, err = p.Store.PutAsset(raw); err != nil {
				http.Error(w, "could not store project asset", 500)
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(doc)
		return
	case "/api/project/save":
		doc, err := scene.Validate(body)
		if err != nil {
			fail(err)
			return
		}
		var raw []byte
		if id := scene.Asset(doc); id != "" {
			raw, err = p.Store.GetAsset(id)
			if err != nil {
				http.Error(w, "heightmap asset missing or damaged; cannot save project", 400)
				return
			}
		}
		output, err = project.Save(doc, raw)
		if err != nil {
			fail(err)
			return
		}
	default:
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = w.Write(output)
}
