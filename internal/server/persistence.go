// SPDX-License-Identifier: Apache-2.0
package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/robert-mcdermott/lithosky/internal/recovery"
	"github.com/robert-mcdermott/lithosky/internal/scene"
)

type Persistence struct {
	Store *recovery.Store
	Token string
}

func (p *Persistence) serve(w http.ResponseWriter, r *http.Request) {
	if p == nil || p.Store == nil {
		http.Error(w, "recovery unavailable", http.StatusServiceUnavailable)
		return
	}
	if r.URL.Path == "/api/session" {
		if r.Method != http.MethodGet {
			method(w, "GET")
			return
		}
		jsonReply(w, map[string]any{"token": p.Token, "revision": p.Store.Revision(), "id": p.Store.ID})
		return
	}
	if p.Token == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Lithosky-Session")), []byte(p.Token)) != 1 {
		http.Error(w, "session authentication required", http.StatusUnauthorized)
		return
	}
	switch {
	case r.URL.Path == "/api/autosave":
		if r.Method != http.MethodPut {
			method(w, "PUT")
			return
		}
		if r.Header.Get("Origin") != "http://"+r.Host {
			http.Error(w, "same-origin write required", http.StatusForbidden)
			return
		}
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			http.Error(w, "JSON required", http.StatusUnsupportedMediaType)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, scene.MaxBytes+1024))
		if err != nil {
			http.Error(w, "autosave exceeds size limit", http.StatusRequestEntityTooLarge)
			return
		}
		var payload struct {
			ExpectedRevision *uint64         `json:"expectedRevision"`
			Scene            json.RawMessage `json:"scene"`
		}
		decoder := json.NewDecoder(strings.NewReader(string(body)))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil || payload.ExpectedRevision == nil {
			http.Error(w, "invalid autosave request", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			http.Error(w, "unexpected trailing data", http.StatusBadRequest)
			return
		}
		data, err := scene.Validate(payload.Scene)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		revision, err := p.Store.Save(*payload.ExpectedRevision, data)
		if errors.Is(err, recovery.ErrConflict) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if err != nil {
			http.Error(w, "could not save recovery; check free disk space and data-directory permissions", http.StatusInternalServerError)
			return
		}
		jsonReply(w, map[string]any{"revision": revision})
	case r.URL.Path == "/api/recovery":
		if r.Method != http.MethodGet {
			method(w, "GET")
			return
		}
		records, skipped, err := p.Store.List()
		if err != nil {
			http.Error(w, "could not list recovery files", http.StatusInternalServerError)
			return
		}
		jsonReply(w, map[string]any{"records": records, "skipped": skipped})
	case strings.HasPrefix(r.URL.Path, "/api/recovery/"):
		if r.Method != http.MethodGet {
			method(w, "GET")
			return
		}
		data, err := p.Store.Load(strings.TrimPrefix(r.URL.Path, "/api/recovery/"))
		if err != nil {
			http.Error(w, "valid recovery scene not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(data)
	default:
		http.NotFound(w, r)
	}
}
func jsonReply(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
func method(w http.ResponseWriter, allowed string) {
	w.Header().Set("Allow", allowed)
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}
