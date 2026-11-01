#!/bin/bash
# Installs or updates Laramac without the "Open Anyway" step.
#   curl -fsSL https://raw.githubusercontent.com/Pino10/laramac/main/install.sh | bash
#
# The DMG is downloaded with curl (which macOS does not flag as quarantined),
# checked against the release's SHA256SUMS.txt and the app's code signature,
# then copied to /Applications. Your settings and data in ~/.laramac are kept.
set -euo pipefail

REPO="Pino10/laramac"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "Laramac runs on macOS."
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) fail "Unsupported Mac: $(uname -m)" ;;
esac

say "Finding the newest Laramac…"
TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=20" \
  | grep -o '"tag_name": *"v[0-9][^"]*"' | head -1 | sed 's/.*"\(v[^"]*\)"/\1/')
[ -n "$TAG" ] || fail "Could not find a release."
VERSION="${TAG#v}"
DMG="Laramac-$VERSION-$ARCH.dmg"
BASE="https://github.com/$REPO/releases/download/$TAG"

WORK=$(mktemp -d)
MOUNT="$WORK/mnt"
cleanup() { hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

say "Downloading Laramac $VERSION for $([ $ARCH = arm64 ] && echo 'Apple Silicon' || echo Intel)…"
curl -fL --progress-bar -o "$WORK/$DMG" "$BASE/$DMG"
curl -fsSL -o "$WORK/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt"

say "Checking the download…"
EXPECTED=$(grep " $DMG\$" "$WORK/SHA256SUMS.txt" | awk '{print $1}')
ACTUAL=$(shasum -a 256 "$WORK/$DMG" | awk '{print $1}')
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || fail "The download does not match its checksum. Nothing was installed."

mkdir -p "$MOUNT"
hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$MOUNT" "$WORK/$DMG" >/dev/null
codesign --verify --deep --strict "$MOUNT/Laramac.app" || fail "The app's signature did not check out. Nothing was installed."

if pgrep -xq Laramac; then
  say "Closing Laramac…"
  osascript -e 'quit app "Laramac"' >/dev/null 2>&1 || true
  sleep 2
fi

say "Installing to /Applications…"
DEST=/Applications/Laramac.app
SUDO=""
[ -w /Applications ] || SUDO=sudo
$SUDO rm -rf "$DEST.new"
$SUDO ditto "$MOUNT/Laramac.app" "$DEST.new"
$SUDO xattr -dr com.apple.quarantine "$DEST.new" 2>/dev/null || true
$SUDO rm -rf "$DEST"
$SUDO mv "$DEST.new" "$DEST"

say "Laramac $VERSION is installed."
open "$DEST"
