#!/bin/sh
# Installs Lithosky on macOS or Linux:
#   curl --proto '=https' --tlsv1.2 -fsSL https://raw.githubusercontent.com/robert-mcdermott/lithosky/main/install.sh | sh
set -eu
umask 022

REPOSITORY=${LITHOSKY_REPOSITORY:-robert-mcdermott/lithosky}
VERSION=${LITHOSKY_VERSION:-latest}
INSTALL_DIR=${LITHOSKY_INSTALL_DIR:-}
FROM_DIR=${LITHOSKY_FROM:-}
TMP_DIR=""
DEST_TMP=""

info() {
  printf '==> %s\n' "$*"
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

error() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Install the latest Lithosky release on macOS or Linux.

Usage:
  install.sh [--version VERSION] [--install-dir DIRECTORY] [--from DIRECTORY]

Options:
  --version VERSION       Release to install, such as v0.6.0. Defaults to latest.
  --install-dir DIRECTORY Installation directory. Defaults to $HOME/.local/bin.
  --from DIRECTORY        Install from release files already on this computer (the
                          executable for this computer and SHA256SUMS) instead of
                          downloading them.
  -h, --help              Show this help.

Environment:
  LITHOSKY_VERSION        Same as --version.
  LITHOSKY_INSTALL_DIR    Same as --install-dir.
  LITHOSKY_FROM           Same as --from.
  LITHOSKY_REPOSITORY     GitHub owner/repository. Defaults to the official repository.

The installer downloads the release executable for this computer and SHA256SUMS
from GitHub, verifies the SHA-256 checksum and the executable's version, and then
installs it as lithosky. It does not use sudo, change PATH, or start Lithosky.
Releases before v0.6.0 have no standalone executables and cannot be installed this way.
USAGE
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

cleanup() {
  if [ -n "${DEST_TMP:-}" ] && [ -e "$DEST_TMP" ]; then
    rm -f "$DEST_TMP"
  fi
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup 0
trap 'exit 1' HUP INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      [ "$#" -ge 2 ] || error "--version requires a value"
      VERSION=$2
      shift 2
      ;;
    --install-dir)
      [ "$#" -ge 2 ] || error "--install-dir requires a value"
      INSTALL_DIR=$2
      shift 2
      ;;
    --from)
      [ "$#" -ge 2 ] || error "--from requires a directory"
      FROM_DIR=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "unknown argument: $1"
      ;;
  esac
done

if [ -z "$INSTALL_DIR" ]; then
  [ -n "${HOME:-}" ] || error "HOME is not set; provide --install-dir"
  INSTALL_DIR="$HOME/.local/bin"
fi

case "$INSTALL_DIR" in
  /*) ;;
  *) error "installation directory must be an absolute path: $INSTALL_DIR" ;;
esac

case "$REPOSITORY" in
  */*/*|/*|*/|'') error "LITHOSKY_REPOSITORY must use owner/repository syntax" ;;
  */*) ;;
  *) error "LITHOSKY_REPOSITORY must use owner/repository syntax" ;;
esac
case "$REPOSITORY" in
  *[!0-9A-Za-z._/-]*) error "invalid LITHOSKY_REPOSITORY: $REPOSITORY" ;;
esac

has_command grep || error "grep is required"
if [ "$VERSION" != latest ]; then
  case "$VERSION" in
    [0-9]*) VERSION="v$VERSION" ;;
  esac
  printf '%s\n' "$VERSION" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$' ||
    error "invalid release version: $VERSION (expected a tag such as v0.6.0)"
fi

if [ -z "$FROM_DIR" ]; then
  has_command curl || error "curl is required"
fi
has_command uname || error "uname is required"
has_command awk || error "awk is required"
has_command mktemp || error "mktemp is required"

OS_NAME=$(uname -s)
ARCH_NAME=$(uname -m)

case "$OS_NAME" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) error "unsupported operating system: $OS_NAME (on Windows, use install.ps1)" ;;
esac

case "$ARCH_NAME" in
  x86_64|amd64) arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) error "unsupported architecture: $ARCH_NAME" ;;
esac

ASSET="lithosky-$os-$arch"
if [ "$VERSION" = latest ]; then
  DOWNLOAD_BASE="https://github.com/$REPOSITORY/releases/latest/download"
  VERSION_LABEL="latest release"
else
  DOWNLOAD_BASE="https://github.com/$REPOSITORY/releases/download/$VERSION"
  VERSION_LABEL=$VERSION
fi

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t lithosky-download) ||
  error "could not create a temporary directory"
BINARY_PATH="$TMP_DIR/$ASSET"
CHECKSUM_PATH="$TMP_DIR/SHA256SUMS"

download() {
  source_url=$1
  destination=$2
  curl \
    --proto '=https' \
    --proto-redir '=https' \
    --tlsv1.2 \
    --fail \
    --silent \
    --show-error \
    --location \
    --retry 3 \
    --connect-timeout 15 \
    --output "$destination" \
    "$source_url"
}

if [ -n "$FROM_DIR" ]; then
  [ -d "$FROM_DIR" ] || error "--from directory not found: $FROM_DIR"
  info "Installing Lithosky for $OS_NAME/$ARCH_NAME from $FROM_DIR"
  [ -f "$FROM_DIR/$ASSET" ] || error "$FROM_DIR has no $ASSET"
  [ -f "$FROM_DIR/SHA256SUMS" ] || error "$FROM_DIR has no SHA256SUMS"
  cp "$FROM_DIR/$ASSET" "$BINARY_PATH" || error "failed to copy $ASSET"
  cp "$FROM_DIR/SHA256SUMS" "$CHECKSUM_PATH" || error "failed to copy SHA256SUMS"
else
  info "Installing Lithosky $VERSION_LABEL for $OS_NAME/$ARCH_NAME"
  info "Downloading $ASSET"
  download "$DOWNLOAD_BASE/$ASSET" "$BINARY_PATH" ||
    error "failed to download $ASSET (releases before v0.6.0 have no standalone executables)"

  info "Downloading SHA256SUMS"
  download "$DOWNLOAD_BASE/SHA256SUMS" "$CHECKSUM_PATH" ||
    error "failed to download SHA256SUMS"
fi

EXPECTED=$(
  awk -v filename="$ASSET" '
    $2 == filename || $2 == "*" filename {
      count++
      checksum = $1
    }
    END {
      if (count != 1) exit 1
      print checksum
    }
  ' "$CHECKSUM_PATH"
) || error "SHA256SUMS does not contain exactly one entry for $ASSET"

[ "${#EXPECTED}" -eq 64 ] || error "invalid SHA-256 value for $ASSET"
case "$EXPECTED" in
  *[!0-9A-Fa-f]*) error "invalid SHA-256 value for $ASSET" ;;
esac

if has_command sha256sum; then
  ACTUAL=$(sha256sum "$BINARY_PATH" | awk '{ print $1 }')
elif has_command shasum; then
  ACTUAL=$(shasum -a 256 "$BINARY_PATH" | awk '{ print $1 }')
else
  error "sha256sum or shasum is required"
fi

EXPECTED=$(printf '%s' "$EXPECTED" | tr '[:upper:]' '[:lower:]')
ACTUAL=$(printf '%s' "$ACTUAL" | tr '[:upper:]' '[:lower:]')
[ "$EXPECTED" = "$ACTUAL" ] || error "checksum verification failed for $ASSET (expected $EXPECTED, got $ACTUAL)"
info "Checksum verified"

if [ ! -d "$INSTALL_DIR" ]; then
  mkdir -p "$INSTALL_DIR" 2>/dev/null ||
    error "cannot create $INSTALL_DIR; choose a writable --install-dir"
fi
[ -w "$INSTALL_DIR" ] || error "cannot write to $INSTALL_DIR; choose a writable --install-dir"

DESTINATION="$INSTALL_DIR/lithosky"
DEST_TMP=$(mktemp "$INSTALL_DIR/.lithosky.staged.XXXXXX") ||
  error "failed to create a temporary file in $INSTALL_DIR"
cp "$BINARY_PATH" "$DEST_TMP" || error "failed to copy the binary into $INSTALL_DIR"
chmod 0755 "$DEST_TMP" || error "failed to make the installed binary executable"
# A file downloaded in a browser carries macOS's quarantine flag, which would block this
# unsigned executable; its checksum has been verified, so the installed copy goes without.
if [ "$os" = darwin ] && has_command xattr; then
  xattr -d com.apple.quarantine "$DEST_TMP" 2>/dev/null || true
fi

INSTALLED_VERSION=$("$DEST_TMP" --version 2>/dev/null) ||
  error "the downloaded binary did not pass its version check"
case "$INSTALLED_VERSION" in
  "Lithosky "*) ;;
  *) error "the downloaded binary reports an unexpected version: $INSTALLED_VERSION" ;;
esac
if [ -z "$FROM_DIR" ] && [ "$VERSION" != latest ] && [ "$INSTALLED_VERSION" != "Lithosky ${VERSION#v}" ]; then
  error "the downloaded binary reports an unexpected version: $INSTALLED_VERSION"
fi

mv -f "$DEST_TMP" "$DESTINATION" || error "failed to install $DESTINATION"
DEST_TMP=""

info "$INSTALLED_VERSION"
info "Installed at $DESTINATION"

case ":${PATH:-}:" in
  *:"$INSTALL_DIR":*) RUN_COMMAND=lithosky ;;
  *)
    warn "$INSTALL_DIR is not in PATH"
    warn "Add it to PATH, or run $DESTINATION directly"
    RUN_COMMAND=$DESTINATION
    ;;
esac

cat <<EOF

Start Lithosky (it opens in an app window; closing the window stops it):
  $RUN_COMMAND

Documentation: https://github.com/$REPOSITORY#readme
EOF
