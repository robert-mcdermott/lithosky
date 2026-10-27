// SPDX-License-Identifier: Apache-2.0
package main

import (
	_ "embed"
	"fmt"
	"io"
)

// Releases are single executables, so the notices travel inside them: `lithosky
// --licenses` prints Lithosky's licence and notice, then the Go runtime's licence.
var (
	//go:embed LICENSE
	licenseText string
	//go:embed NOTICE
	noticeText string
	// The Go runtime and standard library compiled into the binary. The release tool
	// checks this copy matches the toolchain that builds a release.
	//go:embed third_party/GO-LICENSE
	goLicenseText string
)

func printLicenses(w io.Writer) {
	sections := []struct{ title, text string }{
		{"Lithosky — Apache License 2.0", licenseText},
		{"Lithosky — NOTICE", noticeText},
		{"Go runtime and standard library", goLicenseText},
	}
	for i, section := range sections {
		if i > 0 {
			fmt.Fprintln(w)
		}
		fmt.Fprintf(w, "==== %s ====\n\n%s", section.title, section.text)
	}
}
