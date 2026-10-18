// SPDX-License-Identifier: Apache-2.0
package desktop

import (
	"strings"
	"testing"
)

func TestAppIsolation(t *testing.T) {
	args := appArguments("http://127.0.0.1:1234", "/tmp/profile with spaces")
	if args[0] != "--app=http://127.0.0.1:1234" || args[1] != "--user-data-dir=/tmp/profile with spaces" {
		t.Fatal(args)
	}
	for _, arg := range args {
		if strings.Contains(arg, "no-sandbox") || strings.Contains(arg, "disable-web-security") {
			t.Fatal("browser safety disabled")
		}
	}
}

func TestLaunchFailure(t *testing.T) {
	if _, err := Open("http://127.0.0.1:1234", "app", "/nonexistent/lithosky-browser"); err == nil {
		t.Fatal("missing executable accepted")
	}
}
