#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"

cd "$ROOT_DIR"

npm ci
npm run tauri build

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

find "$ROOT_DIR/src-tauri/target/release/bundle" \
  -type f \( -name "*.rpm" -o -name "*.deb" -o -name "*.AppImage" \) \
  -exec cp -f {} "$RELEASE_DIR/" \;

if ! find "$RELEASE_DIR" -type f | grep -q .; then
  echo "No installable release artifacts were found." >&2
  exit 1
fi

(
  cd "$RELEASE_DIR"
  sha256sum * > SHA256SUMS
)

echo "Release artifacts:"
ls -lh "$RELEASE_DIR"
