// SPDX-License-Identifier: Apache-2.0
package server

import (
	"bytes"
	"encoding/json"
	"github.com/robert-mcdermott/lithosky/internal/heightmap"
	"github.com/robert-mcdermott/lithosky/internal/project"
	"github.com/robert-mcdermott/lithosky/internal/recovery"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestHeightmapEndpoints(t *testing.T) {
	store, err := recovery.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p := &Persistence{Store: store, Token: "test-token"}
	h := New(fstest.MapFS{}, "127.0.0.1:8123", "test", p)
	request := func(method, path string, data []byte, token, origin string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewReader(data))
		r.Host = "127.0.0.1:8123"
		r.Header.Set("X-Lithosky-Session", token)
		r.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	raw := make([]byte, 129*129*2)
	raw[1] = 1
	raw[2] = 128
	scale := heightmap.Scale{Format: "lithosky-heightmap", Version: 1, Resolution: 128, Minimum: -2, Maximum: 8, MetersPerUnit: 10, Elevation: 1, RowOrder: "z-increasing"}
	bundle, err := project.ExportHeightmap(raw, scale)
	if err != nil {
		t.Fatal(err)
	}
	for _, auth := range []struct {
		token, origin string
		code          int
	}{{"", "http://127.0.0.1:8123", 401}, {"test-token", "", 403}, {"test-token", "https://example.invalid", 403}} {
		w := request("POST", "/api/heightmap/import", bundle, auth.token, auth.origin)
		if w.Code != auth.code {
			t.Fatal(w.Code, w.Body)
		}
	}
	w := request("POST", "/api/heightmap/import", bundle, "test-token", "http://127.0.0.1:8123")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	var imported struct {
		Asset string
		Scale heightmap.Scale
	}
	if err = json.Unmarshal(w.Body.Bytes(), &imported); err != nil {
		t.Fatal(err)
	}
	if imported.Asset != heightmap.Hash(raw) || imported.Scale != scale {
		t.Fatal("import metadata")
	}
	w = request("GET", "/api/heightmaps/"+imported.Asset, nil, "test-token", "")
	if w.Code != 200 || !bytes.Equal(w.Body.Bytes(), raw) {
		t.Fatal("asset fetch", w.Code)
	}
	if request("GET", "/api/heightmaps/"+imported.Asset, nil, "", "").Code != 401 {
		t.Fatal("unauthenticated asset")
	}
	if request("POST", "/api/project/open", []byte("PKbroken"), "test-token", "http://127.0.0.1:8123").Code != 400 {
		t.Fatal("malformed project")
	}
	if request("PUT", "/api/heightmap/import", bundle, "test-token", "http://127.0.0.1:8123").Code != 405 {
		t.Fatal("wrong method")
	}
	if request("GET", "/api/heightmaps/"+strings.Repeat("0", 64), nil, "test-token", "").Code != 404 {
		t.Fatal("missing asset")
	}
}
