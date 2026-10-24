# Packaging and release readiness

The first public release is First Light (v0.5.0), at the end of Wave 5 (see the
[roadmap](../ROADMAP.md)). The source is `0.5.0`. v0.4.0 was tagged but not published.
Packages are unsigned and not notarized. The release notes are in
[release-notes/0.5.0.md](release-notes/0.5.0.md).

## Local packages

From the repository root, with Go 1.26+ installed:

```sh
go run ./tools/release --version 0.5.0 --out dist/releases/0.5.0
go run ./tools/release --verify dist/releases/0.5.0
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
one executable, LICENSE, NOTICE, GO-LICENSE, README.md (from `docs/distribution.md`),
CHANGELOG.md, BUILD.json and every built-in scene as a `.lithosky` file. The executable embeds all runtime web assets.
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
GitHub Releases.

## Evidence for 0.5.0

Recorded on 2026-10-24 for the W5.S5 changes:

- **Native CI smoke.** The Check workflow (Go tests including the native smoke test,
  `go vet`, the JavaScript tests and a build) passed on macOS, Windows and Linux for
  every Wave 5 slice. The latest is run 39903802028 (W5.S4), with all three jobs green.
  The release commit needs its own green run.
- **Archives.** All six archives were built and verified locally with the release
  tool (see the W5.S5 notes in the changelog).
- **Format.** Scene format v1 is frozen and guarded by `tests/format.test.mjs` and the
  Go corpus test.

## Before tagging (the owner's checks)

On the actual release commit:

1. **CI.** Confirm green Check runs on macOS, Windows and Linux, and run the
   **Package development or release candidate** workflow with version `0.5.0`.
2. **A real app window on each OS.** On Windows and Linux (and macOS), extract the
   matching archive on a clean user profile with Chrome or Edge installed.
   - Launch the app window and check there's no address bar.
   - Check that closing the window stops the app and removes the temporary profile.
3. **The studio on each OS.**
   - Pick a scene from the welcome card, and orbit, pan and zoom.
   - Open each lab, drag a value, and undo it.
   - Save and open a scene.
   - Kill the app and confirm recovery offers the work back.
   - Render a PNG. Record the OS, architecture, browser, GPU, size and samples.
4. **Archive contents.** Run archive verification and review the licence notices.
   Confirm no private research, recovery files, credentials or unrelated files are
   included.
5. **Gates.**
   - Three first-time users (W5.S3).
   - Preset sign-off and hero scores (W5.S4).
6. **Publish.** Merge `wave5`, tag `v0.5.0`, create the GitHub release with the
   archives, `SHA256SUMS` and the release notes, and run **Publish site**. These are
   separate, deliberate actions.

Signing and broader hardware testing remain documented distribution limits.
