// SPDX-License-Identifier: Apache-2.0
package desktop

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

type Window struct {
	Done  <-chan struct{}
	close func()
}

func (w *Window) Close() { w.close() }

// Open never silently replaces an app window with a normal browser tab.
func Open(url, mode, override string) (*Window, error) {
	if mode == "browser" {
		var command string
		var args []string
		switch runtime.GOOS {
		case "darwin":
			command, args = "open", []string{url}
		case "windows":
			command, args = "rundll32", []string{"url.dll,FileProtocolHandler", url}
		default:
			command, args = "xdg-open", []string{url}
		}
		cmd := exec.Command(command, args...)
		if err := cmd.Start(); err != nil {
			return nil, err
		}
		go func() { _ = cmd.Wait() }()
		return &Window{close: func() {}}, nil
	}
	if mode != "app" {
		return nil, errors.New("unknown window mode")
	}
	browser := override
	if browser == "" {
		browser = findBrowser()
	}
	if browser == "" {
		return nil, errors.New("no app-window browser found; install a compatible Chromium-family browser, use --browser /path/to/executable, or choose --window=browser / --no-open")
	}
	profile, err := os.MkdirTemp("", "lithosky-window-")
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(browser, appArguments(url, profile)...)
	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(profile)
		return nil, fmt.Errorf("open app window: %w", err)
	}
	done := make(chan struct{})
	go func() { _ = cmd.Wait(); close(done) }()
	var once sync.Once
	return &Window{Done: done, close: func() {
		once.Do(func() {
			select {
			case <-done:
			default:
				_ = cmd.Process.Kill()
				<-done
			}
			_ = os.RemoveAll(profile)
		})
	}}, nil
}

func appArguments(url, profile string) []string {
	return []string{"--app=" + url, "--user-data-dir=" + profile,
		"--no-first-run", "--no-default-browser-check", "--disable-background-networking",
		"--disable-sync", "--disable-extensions", "--disable-component-update", "--window-size=1440,960"}
}

func findBrowser() string {
	var paths []string
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		for _, root := range []string{"/Applications", filepath.Join(home, "Applications")} {
			for _, app := range []string{"Google Chrome", "Microsoft Edge", "Chromium", "Brave Browser"} {
				paths = append(paths, filepath.Join(root, app+".app", "Contents", "MacOS", app))
			}
		}
	case "windows":
		for _, root := range []string{os.Getenv("LOCALAPPDATA"), os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)")} {
			if root == "" {
				continue
			}
			for _, location := range []string{"Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe", "Chromium/Application/chrome.exe", "BraveSoftware/Brave-Browser/Application/brave.exe"} {
				paths = append(paths, filepath.Join(root, filepath.FromSlash(location)))
			}
		}
	default:
		for _, name := range []string{"chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "brave-browser"} {
			if found, err := exec.LookPath(name); err == nil {
				paths = append(paths, found)
			}
		}
	}
	for _, candidate := range paths {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && (runtime.GOOS == "windows" || info.Mode()&0111 != 0) {
			return candidate
		}
	}
	return ""
}
