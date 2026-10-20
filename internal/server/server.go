// SPDX-License-Identifier: Apache-2.0
package server

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/robert-mcdermott/lithosky/internal/scene"
)

// New protects both embedded assets and authenticated recovery routes.
func New(assets fs.FS, authority, version string, persistence ...*Persistence) http.Handler {
	files := http.FileServer(http.FS(assets))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		if r.Host != authority || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != "http://"+authority) {
			http.Error(w, "local origin required", http.StatusForbidden)
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
			http.Error(w, "cross-site request refused", http.StatusForbidden)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/heightmap") || strings.HasPrefix(r.URL.Path, "/api/project/") || r.URL.Path == "/api/session" || r.URL.Path == "/api/autosave" || r.URL.Path == "/api/recovery" || strings.HasPrefix(r.URL.Path, "/api/recovery/") {
			var p *Persistence
			if len(persistence) > 0 {
				p = persistence[0]
			}
			p.serve(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == "/api/scene-schema" {
			w.Header().Set("Content-Type", "application/schema+json")
			if r.Method == http.MethodGet {
				_, _ = w.Write(scene.Schema)
			}
			return
		}
		if r.URL.Path == "/api/info" {
			w.Header().Set("Content-Type", "application/json")
			if r.Method == http.MethodGet {
				_ = json.NewEncoder(w).Encode(map[string]string{"name": "Lithosky", "version": version, "stage": "Wave 4 · Slice 3", "network": "local only"})
			}
			return
		}
		// Directory paths serve their index page; directories without one stay 404.
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" || strings.HasSuffix(name, "/") {
			name += "index.html"
		}
		if !fs.ValidPath(name) || path.Clean(name) != name {
			http.NotFound(w, r)
			return
		}
		info, err := fs.Stat(assets, name)
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		if strings.HasSuffix(name, ".js") {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		}
		files.ServeHTTP(w, r)
	})
}
