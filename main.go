// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"crypto/rand"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/robert-mcdermott/lithosky/internal/desktop"
	"github.com/robert-mcdermott/lithosky/internal/recovery"
	"github.com/robert-mcdermott/lithosky/internal/server"
)

//go:embed web
var embedded embed.FS

var version = "0.5.0"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Lithosky:", err)
		os.Exit(1)
	}
}

func run() error {
	dataDir := flag.String("data-dir", "", "directory for private recovery snapshots (default: user config directory/Lithosky)")
	port := flag.Int("port", 0, "loopback port (0 chooses an available port)")
	noOpen := flag.Bool("no-open", false, "serve without opening a window; stop with Ctrl+C")
	window := flag.String("window", "app", "window mode: app or browser")
	browser := flag.String("browser", "", "path to a compatible browser executable for app mode")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println("Lithosky", version)
		return nil
	}
	if flag.NArg() != 0 || *port < 0 || *port > 65535 || (*window != "app" && *window != "browser") {
		return errors.New("expected --port 0..65535, --window app|browser, and no positional arguments")
	}
	if *dataDir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return err
		}
		*dataDir = filepath.Join(base, "Lithosky")
	}
	store, err := recovery.New(*dataDir)
	if err != nil {
		return fmt.Errorf("recovery storage: %w", err)
	}
	defer store.Close()
	assets, err := fs.Sub(embedded, "web")
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()
	address := listener.Addr().String()
	srv := &http.Server{
		Handler:           server.New(assets, address, version, &server.Persistence{Store: store, Token: rand.Text()}),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
		WriteTimeout:      30 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	served := make(chan error, 1)
	go func() { served <- srv.Serve(listener) }()
	defer func() {
		shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdown); err != nil {
			_ = srv.Close()
		}
	}()
	url := "http://" + address
	fmt.Printf("Lithosky %s\n%s\nLocal preview studio · Ctrl+C to stop\n", version, url)
	var closed <-chan struct{}
	if !*noOpen {
		windowHandle, err := desktop.Open(url, *window, *browser)
		if err != nil {
			return err
		}
		defer windowHandle.Close()
		closed = windowHandle.Done
	}
	select {
	case <-ctx.Done():
		return nil
	case <-closed:
		return nil
	case err := <-served:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
