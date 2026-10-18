// SPDX-License-Identifier: Apache-2.0
package server

import (
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestLocalBoundary(t *testing.T) {
	assets := fstest.MapFS{"index.html": {Data: []byte("Lithosky")}, "app.js": {Data: []byte("export {}")}}
	h := New(assets, "127.0.0.1:8123", "test")
	for _, tc := range []struct {
		name, method, target, host, origin, site string
		status                                   int
	}{
		{"root", "GET", "/", "127.0.0.1:8123", "", "none", 200},
		{"module", "GET", "/app.js", "127.0.0.1:8123", "", "same-origin", 200},
		{"info", "GET", "/api/info", "127.0.0.1:8123", "http://127.0.0.1:8123", "same-origin", 200},
		{"rebind", "GET", "/", "evil.test:8123", "", "", 403},
		{"origin", "GET", "/api/info", "127.0.0.1:8123", "https://evil.test", "", 403},
		{"null origin", "GET", "/", "127.0.0.1:8123", "null", "", 403},
		{"cross-site", "GET", "/", "127.0.0.1:8123", "", "cross-site", 403},
		{"same-site", "GET", "/", "127.0.0.1:8123", "", "same-site", 403},
		{"write", "POST", "/api/info", "127.0.0.1:8123", "", "", 405},
		{"missing", "GET", "/missing", "127.0.0.1:8123", "", "", 404},
		{"directory", "GET", "/api/", "127.0.0.1:8123", "", "", 404},
		{"traversal", "GET", "/../go.mod", "127.0.0.1:8123", "", "", 404},
		{"head", "HEAD", "/api/info", "127.0.0.1:8123", "", "", 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, tc.target, nil)
			r.Host = tc.host
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Sec-Fetch-Site", tc.site)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d", w.Code, tc.status)
			}
			if !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
				t.Fatal("missing CSP")
			}
			if tc.method == "HEAD" && w.Body.Len() != 0 {
				t.Fatal("HEAD returned body")
			}
			if tc.name == "module" && !strings.HasPrefix(w.Header().Get("Content-Type"), "text/javascript") {
				t.Fatal("wrong module MIME")
			}
		})
	}
}
