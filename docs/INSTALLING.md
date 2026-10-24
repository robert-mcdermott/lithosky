# Installing Lithosky

Lithosky is one executable. The studio, its shaders and the built-in scenes are inside
it. The only other thing you need is a Chromium-family browser (Chrome, Edge, Brave or
Chromium) with WebGPU and graphics acceleration. The browser draws Lithosky's window;
it isn't bundled.

## Release files

| Operating system | Architecture | Release file |
| --- | --- | --- |
| macOS | Apple silicon (ARM64) | `lithosky-darwin-arm64` |
| macOS | Intel (x64) | `lithosky-darwin-amd64` |
| Linux | x64 | `lithosky-linux-amd64` |
| Linux | ARM64 | `lithosky-linux-arm64` |
| Windows | x64 | `lithosky-windows-amd64.exe` |
| Windows | ARM64 | `lithosky-windows-arm64.exe` |

Each release also has `SHA256SUMS`, the SHA-256 checksum of every file. The installers
need it, so they install v0.6.0 and later. Earlier releases shipped archives and can
only be downloaded by hand from the
[releases page](https://github.com/robert-mcdermott/lithosky/releases).

## macOS and Linux

Install the latest release as `$HOME/.local/bin/lithosky`:

```sh
curl --proto '=https' --tlsv1.2 -fsSL \
  https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.sh | sh
```

The installer works out your operating system and CPU and downloads the matching file
and `SHA256SUMS` from the same release. It then:

1. requires exactly one matching checksum
2. runs the downloaded program's `--version`
3. only then moves it into place

So a failed download never replaces a working copy. It doesn't use `sudo`, change
`PATH` or start Lithosky. If `$HOME/.local/bin` isn't on your `PATH`, it prints the
full path to run.

To read the installer before running it:

```sh
curl --proto '=https' --tlsv1.2 -fsSLo install-lithosky.sh \
  https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.sh
less install-lithosky.sh
sh install-lithosky.sh
```

To install a particular release, give its tag:

```sh
curl --proto '=https' --tlsv1.2 -fsSL \
  https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.sh |
  LITHOSKY_VERSION=v0.6.0 sh
```

To install somewhere else, use a directory you can write to:

```sh
curl --proto '=https' --tlsv1.2 -fsSL \
  https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.sh |
  LITHOSKY_INSTALL_DIR="$HOME/bin" sh
```

A downloaded installer takes the same settings as options:

```sh
sh install-lithosky.sh --version v0.6.0 --install-dir "$HOME/bin"
```

| Option | Environment variable | Purpose |
| --- | --- | --- |
| `--version` | `LITHOSKY_VERSION` | Release tag to install. Defaults to the latest release. |
| `--install-dir` | `LITHOSKY_INSTALL_DIR` | Absolute installation directory. Defaults to `$HOME/.local/bin`. |
| `--from` | `LITHOSKY_FROM` | Install from release files already on this computer (see below). |
| — | `LITHOSKY_REPOSITORY` | GitHub `owner/repository`, for forks. |

For a system-wide installation, download and read the script, then run it with an
administrator-owned `--install-dir`. Never pipe a download straight into `sudo sh`.

## Windows

In PowerShell:

```powershell
irm https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.ps1 | iex
```

The program is installed as `$env:LOCALAPPDATA\Programs\Lithosky\lithosky.exe`, and
that folder is added to your user `PATH`. Terminals that are already open keep their
old `PATH`, so open a new one before running `lithosky`.

The installer detects x64 or ARM64 and downloads the program and `SHA256SUMS`. It
requires exactly one matching checksum, runs the program's version check, and replaces
an existing copy only after every check passes. It doesn't need administrator rights.
Windows can't replace a program that is running, so close Lithosky before upgrading.

### Execution policy

`irm … | iex` isn't affected by the PowerShell execution policy, which governs script
*files*. This form reads the script into memory and runs it, so it works under
`Restricted`, `AllSigned` and `RemoteSigned` alike.

The policy does apply to a saved copy of the installer. Bypass it for that one run
instead of changing the setting:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-lithosky.ps1
```

### Options

Piping into `iex` can't pass parameters. Instead, set environment variables, which the
piped form reads:

```powershell
$env:LITHOSKY_VERSION = 'v0.6.0'
$env:LITHOSKY_INSTALL_DIR = "$HOME\bin"
irm https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.ps1 | iex
```

Or build a script block, which accepts parameters:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.ps1))) `
  -Version v0.6.0 -InstallDir "$HOME\bin"
```

| Parameter | Environment variable | Purpose |
| --- | --- | --- |
| `-Version` | `LITHOSKY_VERSION` | Release tag to install. Defaults to the latest release. |
| `-InstallDir` | `LITHOSKY_INSTALL_DIR` | Absolute installation folder. |
| `-From` | `LITHOSKY_FROM` | Install from release files already on this computer. |
| `-Repository` | `LITHOSKY_REPOSITORY` | GitHub `owner/repository`, for forks. |
| `-Architecture` | `LITHOSKY_ARCH` | `amd64` or `arm64`, when detection fails. |
| `-NoPathUpdate` | `LITHOSKY_NO_PATH_UPDATE` | Leave the user `PATH` unchanged. |

A parameter takes precedence over its environment variable.

## Installing from downloaded files

Use `--from` (or `-From`) to install without the installer downloading anything:
offline, behind a proxy, or from a build you made. Point it at a folder holding the
executable for this computer and `SHA256SUMS`. The installer runs the same checksum
and version checks on them before installing.

```sh
sh install-lithosky.sh --from ~/Downloads/lithosky-v0.6.0
```

```powershell
powershell -ExecutionPolicy Bypass -File .\install-lithosky.ps1 -From "$HOME\Downloads\lithosky-v0.6.0"
```

Files saved from a browser carry the operating system's download flag (macOS
quarantine, or the Windows mark of the web). That flag would stop these unsigned
programs at first start, so the installer clears it on the installed copy once the
checksum has passed.

## Downloading and verifying by hand

On macOS or Linux, choose the file for your computer from the table above:

```sh
ASSET=lithosky-linux-amd64
curl -fLO "https://github.com/robert-mcdermott/lithosky/releases/latest/download/$ASSET"
curl -fLO https://github.com/robert-mcdermott/lithosky/releases/latest/download/SHA256SUMS
grep "  $ASSET\$" SHA256SUMS | sha256sum --check -
chmod +x "$ASSET"
./"$ASSET" --version
```

On macOS, use `shasum -a 256 --check -` instead of `sha256sum --check -`.

In PowerShell:

```powershell
$Asset = 'lithosky-windows-amd64.exe'
$Base = 'https://github.com/robert-mcdermott/lithosky/releases/latest/download'
Invoke-WebRequest -UseBasicParsing "$Base/$Asset" -OutFile $Asset
Invoke-WebRequest -UseBasicParsing "$Base/SHA256SUMS" -OutFile SHA256SUMS
$Expected = (Select-String -Path SHA256SUMS -Pattern ('  ' + [regex]::Escape($Asset) + '$')).Line.Split(' ')[0]
$Actual = (Get-FileHash -Algorithm SHA256 $Asset).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw 'Checksum verification failed' }
& ".\$Asset" --version
```

The checksum catches a damaged download, or a file that differs from the release's
list. Both come from the same release, so it can't protect against someone able to
replace both.

### Files downloaded in a browser

Lithosky isn't signed with an Apple or Microsoft certificate yet. The installers and
the commands above download without a browser, so the operating system doesn't flag
the file. A file saved from a browser is flagged, and the first start asks for
confirmation (or use `--from` above, which clears the flag after checking the
checksum).

**macOS.** A warning such as *Apple could not verify "lithosky-darwin-arm64" is free of
malware* appears. Either open **System Settings → Privacy & Security**, find the
message about Lithosky and click **Open Anyway**, or remove the flag in Terminal:

```sh
xattr -d com.apple.quarantine ./lithosky-darwin-arm64
chmod +x ./lithosky-darwin-arm64
```

**Windows.** If SmartScreen blocks the program, click **More info**, then **Run
anyway**. Or run `Unblock-File .\lithosky-windows-amd64.exe` in PowerShell first.

## Running Lithosky

Run `lithosky`. It opens its own app window in your browser, and closing the window
stops it. `lithosky --help` lists the options:

- `--window=browser` uses a regular tab
- `--no-open` only prints the local address
- `--data-dir` moves the recovery snapshots

`lithosky --licenses` prints the licences of Lithosky and the Go runtime built into it.

## Upgrading and going back

Running the installer again upgrades Lithosky. A failed download, checksum or version
check leaves the installed copy as it was. Your scenes and recovery snapshots aren't
touched.

To go back to an earlier release (v0.6.0 or later), install it by tag:

```sh
LITHOSKY_VERSION=v0.6.0 sh install-lithosky.sh
```

```powershell
$env:LITHOSKY_VERSION = 'v0.6.0'
irm https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.ps1 | iex
```

## Uninstalling

Delete the program:

- macOS and Linux: `~/.local/bin/lithosky`
- Windows: the `%LocalAppData%\Programs\Lithosky` folder. You can also remove its
  entry from the user `PATH` (**Settings → System → About → Advanced system settings →
  Environment Variables**).

Lithosky keeps recovery snapshots of unsaved work in your user configuration folder,
which you can delete as well:

- macOS: `~/Library/Application Support/Lithosky`
- Linux: `~/.config/Lithosky`
- Windows: `%AppData%\Lithosky`

Scenes you saved stay wherever you saved them.

## Building from source

With the Go version in `go.mod` or newer:

```sh
git clone https://github.com/robert-mcdermott/lithosky.git
cd lithosky
go test ./...
go build -trimpath -o bin/lithosky .
./bin/lithosky --version
```

[Releases](releases.md) describes how releases are built and published.
