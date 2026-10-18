// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

// This helper emulates only the browser process contract. Real GUI/GPU checks
// are separate; a hosted CI runner is not evidence of desktop graphics support.
func TestMain(m *testing.M) {
	if marker := os.Getenv("LITHOSKY_SMOKE_BROWSER"); marker != "" {
		args, _ := json.Marshal(os.Args[1:])
		if os.WriteFile(marker, args, 0600) != nil {
			os.Exit(2)
		}
		for range 2000 {
			if _, err := os.Stat(marker + ".close"); err == nil {
				os.Exit(0)
			}
			time.Sleep(10 * time.Millisecond)
		}
		os.Exit(3)
	}
	os.Exit(m.Run())
}
func TestStandaloneBinary(t *testing.T) {
	if testing.Short() {
		t.Skip("builds and launches a standalone executable")
	}
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	exe := filepath.Join(dir, "lithosky")
	if runtime.GOOS == "windows" {
		exe += ".exe"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	build := exec.CommandContext(ctx, "go", "build", "-trimpath", "-o", exe, ".")
	build.Dir = root
	if data, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v: %s", err, data)
	}
	if data, err := exec.CommandContext(ctx, exe, "--version").CombinedOutput(); err != nil || !strings.Contains(string(data), version) {
		t.Fatalf("version: %v: %s", err, data)
	}
	dataDir := filepath.Join(dir, "recovery")
	type process struct {
		url    string
		exited <-chan struct{}
		stop   func()
	}
	start := func(extra []string, env []string) process {
		t.Helper()
		args := append([]string{"--data-dir", dataDir}, extra...)
		cmd := exec.CommandContext(ctx, exe, args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), env...)
		pipe, err := cmd.StdoutPipe()
		if err != nil {
			t.Fatal(err)
		}
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Start(); err != nil {
			t.Fatal(err)
		}
		exited := make(chan struct{})
		go func() { _ = cmd.Wait(); close(exited) }()
		var once sync.Once
		stop := func() { once.Do(func() { _ = cmd.Process.Kill(); <-exited }) }
		t.Cleanup(stop)
		addresses := make(chan string, 1)
		go func() {
			scanner := bufio.NewScanner(pipe)
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "http://127.0.0.1:") {
					select {
					case addresses <- line:
					default:
					}
				}
			}
		}()
		select {
		case address := <-addresses:
			return process{address, exited, stop}
		case <-exited:
			t.Fatalf("startup: %s", stderr.String())
		case <-time.After(20 * time.Second):
			stop()
			t.Fatalf("startup timeout: %s", stderr.String())
		}
		return process{}
	}
	client := &http.Client{Timeout: 5 * time.Second}
	request := func(p process, method, path, token string, body []byte) []byte {
		t.Helper()
		req, err := http.NewRequest(method, p.url+path, bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		if token != "" {
			req.Header.Set("X-Lithosky-Session", token)
		}
		if body != nil {
			req.Header.Set("Origin", p.url)
			req.Header.Set("Content-Type", "application/json")
		}
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		if err != nil || response.StatusCode != 200 {
			t.Fatalf("%s: %d %v %s", path, response.StatusCode, err, data)
		}
		return data
	}
	p := start([]string{"--no-open"}, nil)
	if !bytes.Contains(request(p, "GET", "/api/info", "", nil), []byte(version)) {
		t.Fatal("wrong build served")
	}
	err = fs.WalkDir(embedded, "web", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		expected, err := embedded.ReadFile(path)
		if err != nil {
			return err
		}
		route := strings.TrimPrefix(path, "web")
		if route == "/index.html" {
			route = "/"
		}
		actual := request(p, "GET", route, "", nil)
		if !bytes.Equal(expected, actual) {
			t.Errorf("embedded asset mismatch: %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var session struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(request(p, "GET", "/api/session", "", nil), &session); err != nil {
		t.Fatal(err)
	}
	catalog, _ := embedded.ReadFile("web/scenes/studies.json")
	var studies []struct {
		Scene json.RawMessage `json:"scene"`
	}
	if err := json.Unmarshal(catalog, &studies); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"expectedRevision": 0, "scene": studies[0].Scene})
	request(p, "PUT", "/api/autosave", session.Token, payload)
	p.stop()
	p = start([]string{"--no-open"}, nil)
	if err := json.Unmarshal(request(p, "GET", "/api/session", "", nil), &session); err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(request(p, "GET", "/api/recovery", session.Token, nil), []byte("Alpine quiet")) {
		t.Fatal("recovery missing after process restart")
	}
	p.stop()
	helper, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(dir, "browser-arguments.json")
	p = start([]string{"--browser", helper}, []string{"LITHOSKY_SMOKE_BROWSER=" + marker})
	var args []string
	for range 500 {
		if data, err := os.ReadFile(marker); err == nil && json.Unmarshal(data, &args) == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	var profile string
	app := false
	for _, arg := range args {
		if arg == "--app="+p.url {
			app = true
		}
		if strings.HasPrefix(arg, "--user-data-dir=") {
			profile = strings.TrimPrefix(arg, "--user-data-dir=")
		}
	}
	if !app || profile == "" {
		t.Fatalf("missing app-window isolation: %v", args)
	}
	if _, err := os.Stat(profile); err != nil {
		t.Fatal("missing temporary browser profile", err)
	}
	if err := os.WriteFile(marker+".close", nil, 0600); err != nil {
		t.Fatal(err)
	}
	select {
	case <-p.exited:
	case <-time.After(10 * time.Second):
		t.Fatal("server did not exit when browser closed")
	}
	if _, err := os.Stat(profile); !os.IsNotExist(err) {
		t.Fatal("temporary profile remains", err)
	}
}
