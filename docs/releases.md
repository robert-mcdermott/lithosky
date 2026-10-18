# Packaging and release readiness

Wave 1 targets v0.1.0; wave 2 targets v0.2.0. The current source is
`0.2.0-dev.3`; there is no release tag or publication implied by completing implementation. Packages are unsigned and
not notarized. The generated website describes development capabilities only.

## Local packages

From the repository root, with Go 1.26+ installed:

```sh
go run ./tools/release --version 0.2.0-dev.3 --out dist/releases/0.2.0-dev.3
go run ./tools/release --verify dist/releases/0.2.0-dev.3
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
and JavaScript/site tests before creating archives and a generated-site artifact.
It retains native smoke JSON reports. Uploads are CI artifacts for review, not
GitHub Releases or website deployment. No workflow has been run remotely by this
local task; native Windows/Linux results are pending.

## Remaining release gates

Before tagging v0.1.0, record evidence for the actual release commit:

- Green native CI smoke on macOS, Windows and Linux, with its workflow run ID.
- Extract the matching archive on a clean user profile on each OS with a compatible
  browser installed. Launch its real app window; verify no address bar, correct
  close behavior, and temporary-profile cleanup.
- Select each starter, orbit/zoom/reset, save/open, edit/undo and recover after an
  interrupted session. Render and export a PNG; test cancellation and WebGL preview
  fallback. Record OS, architecture, browser, GPU, dimensions and sample count.
- Run archive verification and review all license notices. Confirm no private
  research, local recovery files, credentials or unrelated assets are included.
- Build/preview the site and confirm capabilities, screenshots, versions and
  download links match the release. Only then create the release/tag and publish
  the reviewed site as separate authorized actions.

Local macOS and cross-build evidence is in [validation](validation.md). Native
Windows/Linux acceptance is still open. Wave 2 development was explicitly
requested; it does not close those pending release checks. Broader hardware testing and
signing remain documented distribution limits.
