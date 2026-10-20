# Packaging and release readiness

Nothing has been released. Wave 4 is tagged v0.4.0 when it completes but is not
published. The first public release is First Light (v0.5.0) at the end of Wave 5, as
the [roadmap](../ROADMAP.md) describes. The current source is `0.4.0-dev.3`. Packages
are unsigned and not notarized.

## Local packages

From the repository root, with Go 1.26+ installed:

```sh
go run ./tools/release --version 0.4.0-dev.3 --out dist/releases/0.4.0-dev.3
go run ./tools/release --verify dist/releases/0.4.0-dev.3
```

The destination must not exist. Use a fresh directory for a second build. The
builder stages output and publishes the directory only after all requested builds
succeed. It never tags, pushes, signs, uploads or publishes. `--targets current`
packages only the current platform; a comma-separated list such as
`--targets darwin/arm64,windows/amd64` selects other supported targets.

The default creates six archives:

| Platform | Architectures | Format |
|---|---|---|
| macOS (`darwin`) | amd64, arm64 | tar.gz |
| Linux | amd64, arm64 | tar.gz |
| Windows | amd64, arm64 | zip |

Every archive has one top-level `lithosky-VERSION-OS-ARCH/` directory containing
one executable, LICENSE, NOTICE, GO-LICENSE, README.md, CHANGELOG.md, BUILD.json
and three starter scene files. The executable embeds all runtime web assets.
The browser remains an installed prerequisite. Binary builds use `CGO_ENABLED=0`,
`-trimpath`, `-buildvcs=false`, and an explicit version; archive ordering, modes
and timestamps are stable. Reproducibility requires identical source, toolchain
and build environment, including relevant Go build flags.

BUILD.json records source commit and dirty status. Do not promote dirty-worktree
packages to a release; rebuild from the reviewed clean commit. It also records
the Go toolchain, target and executable hash. SHA256SUMS covers the outer archives.
The verifier reads both formats without extraction, checks hashes and required
members, executable mode, build metadata, notices, and schema-valid scene files.
It rejects missing/extra contents, altered binaries and invalid checksums.
Checksums are integrity checks, not a publisher signature.

## Automated native smoke

`go test ./...` builds the executable for the current OS and runs it outside the
checkout with disposable recovery storage. It verifies version, every embedded
asset, authenticated autosave and recovery after process interruption. A helper
process verifies app-window URL/profile arguments, server shutdown after the
window process exits, and profile removal. That helper does not test a real
browser or GPU.

The Check workflow runs on macOS, Windows and Linux. The manual **Package
development or release candidate** workflow requires all three native smoke jobs
and the JavaScript tests before creating archives.
It retains native smoke JSON reports. Uploads are CI artifacts for review, not
GitHub Releases. Native Windows/Linux results are pending.

## Remaining release gates

Before tagging the first public release, record evidence for the actual release commit:

- Green native CI smoke on macOS, Windows and Linux, with its workflow run ID.
- Extract the matching archive on a clean user profile on each OS with a compatible
  browser installed. Launch its real app window; verify no address bar, correct
  close behavior, and temporary-profile cleanup.
- Select each preset, orbit/pan/zoom, save/open, edit/undo and recover after an
  interrupted session. Export a PNG. Record OS, architecture, browser, GPU,
  dimensions and sample count.
- Run archive verification and review all license notices. Confirm no private
  research, local recovery files, credentials or unrelated assets are included.
- Rebuild the product site from real renders (W5.S5), then create the release and tag
  as separate authorized actions.

Native Windows/Linux acceptance is still open. Broader hardware testing and signing
remain documented distribution limits.
