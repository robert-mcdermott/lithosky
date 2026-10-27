# Releases

From v0.6.0, a Lithosky release is six standalone executables and a `SHA256SUMS`
manifest, attached to a GitHub release. The installers (`install.sh` and `install.ps1`,
see [Installing](INSTALLING.md)) download the file for the computer, check it against
the manifest and its own version, and install it. v0.5.0 (First Light) and earlier
shipped archives instead.

Packages aren't signed or notarized; that's a documented distribution limit.

## Release files

| File | Built for |
| --- | --- |
| `lithosky-darwin-arm64`, `lithosky-darwin-amd64` | macOS on Apple silicon and Intel |
| `lithosky-linux-amd64`, `lithosky-linux-arm64` | Linux on x64 and ARM64 |
| `lithosky-windows-amd64.exe`, `lithosky-windows-arm64.exe` | Windows on x64 and ARM64 |
| `SHA256SUMS` | SHA-256 of each file, in `sha256sum` format |

Each executable embeds the web app, shaders, built-in scenes and its licence notices.
`lithosky --licenses` prints LICENSE, NOTICE and the Go runtime's licence
(`third_party/GO-LICENSE`).

## Building locally

From the repository root, with the Go version in `go.mod`:

```sh
go run ./tools/release --version 0.6.0 --out dist/releases/0.6.0
go run ./tools/release --verify dist/releases/0.6.0 --version 0.6.0
```

**Building.** The destination must not exist. `--targets current` builds only this
computer's file. Builds use `CGO_ENABLED=0`, `-trimpath`, `-buildvcs=false`, stripped
symbols and the version set with `-X main.version`. The builder refuses to run if
`third_party/GO-LICENSE` differs from the toolchain's licence, and warns about
uncommitted changes.

**Verifying** checks that:

- `SHA256SUMS` names every file exactly once with a matching hash, and no other files
  are present
- each executable is a Mach-O, ELF or PE file for the CPU its name says
- each carries the licence notices and the version
- this computer's executable runs and reports `Lithosky VERSION`

## Publishing a release

1. Set `var version` in `main.go` to the release version, such as `0.6.0`.
2. Add a `## 0.6.0 — …` section to `CHANGELOG.md`. Optionally write
   `docs/release-notes/0.6.0.md`, which the release page uses instead of the
   changelog section.
3. Merge to `main`, then tag and push:

   ```sh
   git tag v0.6.0
   git push origin v0.6.0
   ```

4. The **Release** workflow checks that the tag, `main.go` and the changelog agree,
   runs the tests, builds and verifies the six executables, and creates a **draft**
   release with them, `SHA256SUMS`, the notes and install instructions. A version
   with a hyphen, such as `0.6.0-rc.1`, becomes a prerelease. Its notes come from
   `docs/release-notes/0.6.0.md` when it has none of its own, and its install commands
   name the tag and fetch the installers from it.
5. Review the draft, then check it from a clean user profile on each OS. Run
   `install.sh` or `install.ps1` with `--version`/`-Version` set to the tag. A draft's
   files can't be downloaded anonymously, so either use `--from` on files you
   downloaded, or test a release candidate: publish it (a prerelease never becomes
   "latest") and use the install commands on its release page. Then launch the app
   window, open a scene, edit, save, recover and render.
6. Publish the draft. The installers' default, "latest", now installs it, and CI's
   installer job starts testing the published release.

**Package a development build** (a manual workflow) builds the same files as CI
artifacts without a tag, for testing between releases.

## Installer checks in CI

The **Check** workflow's installer job runs on macOS, Linux and Windows for every push:

- It builds that commit's executable.
- It installs it with `install.sh`, or with `install.ps1` under both Windows
  PowerShell and PowerShell 7 piped into `Invoke-Expression`, using `--from`/`-From`.
- It confirms that a tampered copy is refused and nothing is installed.
- Once a published release has standalone executables, it also installs the latest
  release from GitHub.

## The product site

`site/` is a static page. **Publish site** deploys it to GitHub Pages whenever `site/`
changes on `main`, and when started by hand. Pages must be switched on once, with
GitHub Actions as the source. Use **Settings → Pages → Build and deployment → Source:
GitHub Actions**, or:

```sh
gh api -X POST repos/robert-mcdermott/lithosky/pages -f build_type=workflow
```

Without that, `actions/configure-pages` fails with "Get Pages site failed … Not Found",
which is what happened to the first deploy of the 0.5.0 site.

`bench/gallery.mjs` renders the gallery images (see the README).

## Evidence for v0.5.0

Native CI smoke passed on macOS, Windows and Linux for every Wave 5 slice (the last
before the release was run 39903802028). The archives were built and verified locally.
Scene format v1 is frozen and guarded by `tests/format.test.mjs` and the Go corpus test.

## Limits

- No code signing or notarization yet. Browser-downloaded files are flagged by
  macOS and Windows; the installers avoid that, as [Installing](INSTALLING.md)
  explains.
- The checksum catches damaged or substituted files, but not someone able to
  replace both the executable and `SHA256SUMS` in a release.
- Hardware testing beyond CI and the owner's checks is limited.
