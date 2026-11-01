#!/bin/bash
# Installs or updates Laramac without the "Open Anyway" step.
#   curl -fsSL https://raw.githubusercontent.com/Pino10/laramac-releases/main/install.sh | bash
#
# The DMG is downloaded with curl (which macOS does not flag as quarantined),
# checked against the release's SHA256SUMS.txt and the app's code signature,
# then copied to /Applications. Your settings and data in ~/.laramac are kept.
set -euo pipefail

REPO="Pino10/laramac-releases"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "Laramac runs on macOS."
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) fail "Unsupported Mac: $(uname -m)" ;;
esac

say "Finding the newest Laramac…"
WORK=$(mktemp -d)
MOUNT="$WORK/mnt"
cleanup() { hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=20" 2>/dev/null \
  | grep -o '"tag_name": *"v[0-9][^"]*"' | head -1 | sed 's/.*"\(v[^"]*\)"/\1/' || true)

if [ -n "$TAG" ]; then
  VERSION="${TAG#v}"; DMG="Laramac-$VERSION-$ARCH.dmg"
  BASE="https://github.com/$REPO/releases/download/$TAG"
  say "Downloading Laramac $VERSION for $([ $ARCH = arm64 ] && echo 'Apple Silicon' || echo Intel)…"
  curl -fL --progress-bar -o "$WORK/$DMG" "$BASE/$DMG"
  curl -fsSL -o "$WORK/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt"
else
  # While Laramac is tested privately, its releases live in the private source repository.
  # The GitHub CLI (signed in with access to it) downloads them.
  PRIVATE="Pino10/laramac"
  command -v gh >/dev/null 2>&1 || fail "Laramac is being tested privately. Install the GitHub CLI (brew install gh), run 'gh auth login', then run this again."
  TAG=$(gh release list -R "$PRIVATE" --limit 30 --json tagName --jq '[.[] | select(.tagName | test("^v[0-9]"))][0].tagName' 2>/dev/null || true)
  [ -n "$TAG" ] || fail "Could not find a release. Run 'gh auth login' with an account that can see $PRIVATE."
  VERSION="${TAG#v}"; DMG="Laramac-$VERSION-$ARCH.dmg"
  say "Downloading Laramac $VERSION (private preview)…"
  gh release download "$TAG" -R "$PRIVATE" -D "$WORK" -p "$DMG" -p SHA256SUMS.txt
fi

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
