// SPDX-License-Identifier: Apache-2.0
package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/robert-mcdermott/lithosky/internal/recovery"
	"github.com/robert-mcdermott/lithosky/internal/scene"
)

func TestRecoveryAPI(t *testing.T) {
	store, err := recovery.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	h := New(fstest.MapFS{}, "127.0.0.1:8123", "test", &Persistence{Store: store, Token: "test-secret"})
	fixtures, err := os.ReadFile("../../tests/fixtures/scenes.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct{ Scene json.RawMessage }
	if err := json.Unmarshal(fixtures, &cases); err != nil {
		t.Fatal(err)
	}
	payload := `{"expectedRevision":0,"scene":` + string(cases[0].Scene) + `}`
	request := func(method, path, body, token, origin, contentType string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Host = "127.0.0.1:8123"
		r.Header.Set("X-Lithosky-Session", token)
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", contentType)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	for _, tc := range []struct {
		name, path, token, origin, media, body string
		status                                 int
	}{
		{"missing token", "/api/autosave", "", "http://127.0.0.1:8123", "application/json", payload, 401},
		{"wrong token", "/api/autosave", "wrong", "http://127.0.0.1:8123", "application/json", payload, 401},
		{"absent origin", "/api/autosave", "test-secret", "", "application/json", payload, 403},
		{"foreign origin", "/api/autosave", "test-secret", "https://evil.test", "application/json", payload, 403},
		{"wrong content", "/api/autosave", "test-secret", "http://127.0.0.1:8123", "text/plain", payload, 415},
		{"oversize", "/api/autosave", "test-secret", "http://127.0.0.1:8123", "application/json", strings.Repeat(" ", scene.MaxBytes+1025), 413},
		{"invalid scene", "/api/autosave", "test-secret", "http://127.0.0.1:8123", "application/json", `{"expectedRevision":0,"scene":{}}`, 400},
		{"extra field", "/api/autosave", "test-secret", "http://127.0.0.1:8123", "application/json", strings.TrimSuffix(payload, "}") + `,"path":"../outside"}`, 400},
		{"trailing", "/api/autosave", "test-secret", "http://127.0.0.1:8123", "application/json", payload + ` {}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := request("PUT", tc.path, tc.body, tc.token, tc.origin, tc.media)
			if w.Code != tc.status {
				t.Fatalf("%d: %s", w.Code, w.Body)
			}
		})
	}
	if store.Revision() != 0 {
		t.Fatal("rejected writes changed recovery")
	}
	w := request("PUT", "/api/autosave", payload, "test-secret", "http://127.0.0.1:8123", "application/json")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	// A stale tab cannot change the saved scene.
	stale := strings.Replace(payload, `"seed": 1847`, `"seed": 1`, 1)
	if w := request("PUT", "/api/autosave", stale, "test-secret", "http://127.0.0.1:8123", "application/json"); w.Code != 409 {
		t.Fatal("stale write accepted", w.Code)
	}
	if w := request("GET", "/api/recovery", "", "", "", ""); w.Code != 401 {
		t.Fatal("unauthenticated recovery read")
	}
	w = request("GET", "/api/recovery/"+store.ID, "", "test-secret", "", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"seed":1847`) {
		t.Fatal("recovery differs", w.Body)
	}
	if w := request("GET", "/api/recovery/../../secret", "", "test-secret", "", ""); w.Code != 404 {
		t.Fatal("path escaped")
	}
	w = request("GET", "/api/session", "", "", "", "")
	var session map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &session); err != nil || session["token"] != "test-secret" || session["revision"] != float64(1) {
		t.Fatal("invalid session", session, err)
	}
	w = request("GET", "/api/scene-schema", "", "", "", "")
	if w.Code != http.StatusOK {
		t.Fatal("schema unavailable")
	}
	if _, err := io.ReadAll(w.Result().Body); err != nil {
		t.Fatal(err)
	}
}
