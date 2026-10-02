#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ ! -d build/package ]]; then
  echo "Build output is missing. Run 'npm run build' first." >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is required to build the Linux installer." >&2
  exit 1
fi

VERSION="$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) PRODUCT_ARCH="x64" ;;
  aarch64|arm64) PRODUCT_ARCH="arm64" ;;
  *) echo "Unsupported Linux build architecture: $ARCH" >&2; exit 1 ;;
esac

STAGE="$ROOT/build/installer-linux/stage"
PAYLOAD="$ROOT/build/installer-linux/payload.tar.gz"
ARTIFACTS="$ROOT/artifacts"
OUT="$ARTIFACTS/ALRemastered-Linux-${PRODUCT_ARCH}.run"

rm -rf "$ROOT/build/installer-linux"
mkdir -p "$STAGE/app" "$STAGE/runtime" "$ARTIFACTS"
cp -a "$ROOT/build/package/." "$STAGE/app/"
cp "$NODE_BIN" "$STAGE/runtime/node"
chmod +x "$STAGE/runtime/node"

cat > "$STAGE/alremastered" <<'LAUNCHER'
#!/usr/bin/env sh
set -eu
BASE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$BASE/runtime/node" "$BASE/app/src/main.js" "$@"
LAUNCHER
chmod +x "$STAGE/alremastered"

cat > "$STAGE/uninstall.sh" <<'UNINSTALL'
#!/usr/bin/env sh
set -eu
SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ASSUME_YES=0
if [ "${1:-}" = "--yes" ]; then ASSUME_YES=1; fi
if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Remove ALRemastered from "%s"? [y/N]: ' "$SELF_DIR"
  read -r answer || answer=""
  case "$answer" in y|Y|yes|YES) ;; *) echo "Uninstall cancelled."; exit 0 ;; esac
fi
LINK="$HOME/.local/bin/alremastered"
if [ -L "$LINK" ] && [ "$(readlink "$LINK")" = "$SELF_DIR/alremastered" ]; then rm -f "$LINK"; fi
DESKTOP="$HOME/.local/share/applications/alremastered.desktop"
if [ -f "$DESKTOP" ] && grep -Fq "$SELF_DIR/alremastered" "$DESKTOP"; then rm -f "$DESKTOP"; fi
rm -rf "$SELF_DIR"
echo "ALRemastered was removed."
UNINSTALL
chmod +x "$STAGE/uninstall.sh"

tar -C "$STAGE" -czf "$PAYLOAD" .

cat > "$OUT" <<EOF_HEADER
#!/usr/bin/env sh
set -eu
APP_NAME="ALRemastered"
VERSION="$VERSION"
DEFAULT_DIR="\${XDG_DATA_HOME:-\$HOME/.local/share}/ALRemastered"
INSTALL_DIR=""
ASSUME_YES=0
CREATE_DESKTOP=1

while [ "\$#" -gt 0 ]; do
  case "\$1" in
    --install-dir) INSTALL_DIR="\${2:-}"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --no-desktop) CREATE_DESKTOP=0; shift ;;
    --version) echo "\$VERSION"; exit 0 ;;
    *) echo "Unknown option: \$1" >&2; exit 2 ;;
  esac
done

if [ -z "\$INSTALL_DIR" ]; then
  if command -v zenity >/dev/null 2>&1 && { [ -n "\${DISPLAY:-}" ] || [ -n "\${WAYLAND_DISPLAY:-}" ]; }; then
    INSTALL_DIR="\$(zenity --entry --title="ALRemastered Setup" --text="Choose the installation folder:" --entry-text="\$DEFAULT_DIR")" || exit 1
  elif command -v kdialog >/dev/null 2>&1 && { [ -n "\${DISPLAY:-}" ] || [ -n "\${WAYLAND_DISPLAY:-}" ]; }; then
    INSTALL_DIR="\$(kdialog --inputbox "Choose the installation folder:" "\$DEFAULT_DIR" --title "ALRemastered Setup")" || exit 1
  else
    printf 'Installation folder [%s]: ' "\$DEFAULT_DIR"
    read -r answer || answer=""
    INSTALL_DIR="\${answer:-\$DEFAULT_DIR}"
  fi
fi

if [ -z "\$INSTALL_DIR" ]; then echo "No installation folder selected." >&2; exit 1; fi

if [ "\$ASSUME_YES" -ne 1 ]; then
  printf 'Install ALRemastered %s to "%s"? [Y/n]: ' "\$VERSION" "\$INSTALL_DIR"
  read -r answer || answer=""
  case "\$answer" in n|N|no|NO) echo "Installation cancelled."; exit 0 ;; esac
fi

TMP_ROOT="\$(mktemp -d)"
trap 'rm -rf "\$TMP_ROOT"' EXIT HUP INT TERM
ARCHIVE_LINE="\$(awk '/^__ALREMASTERED_ARCHIVE_BELOW__\$/ {print NR + 1; exit}' "\$0")"
if [ -z "\$ARCHIVE_LINE" ]; then echo "Installer payload marker is missing." >&2; exit 1; fi
mkdir -p "\$TMP_ROOT/payload" "\$INSTALL_DIR"
tail -n +"\$ARCHIVE_LINE" "\$0" | tar -xz -C "\$TMP_ROOT/payload"
rm -rf "\$INSTALL_DIR/app" "\$INSTALL_DIR/runtime"
cp -a "\$TMP_ROOT/payload/." "\$INSTALL_DIR/"

mkdir -p "\$HOME/.local/bin"
ln -sfn "\$INSTALL_DIR/alremastered" "\$HOME/.local/bin/alremastered"

if [ "\$CREATE_DESKTOP" -eq 1 ]; then
  mkdir -p "\$HOME/.local/share/applications"
  cat > "\$HOME/.local/share/applications/alremastered.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=ALRemastered
Comment=Adventure Land headless client
Exec=\$INSTALL_DIR/alremastered
Terminal=true
Categories=Game;Utility;
DESKTOP
fi

printf 'ALRemastered %s was installed successfully.\n' "\$VERSION"
printf 'Installation folder: %s\n' "\$INSTALL_DIR"
printf 'Run: %s/alremastered\n' "\$INSTALL_DIR"
exit 0
__ALREMASTERED_ARCHIVE_BELOW__
EOF_HEADER
cat "$PAYLOAD" >> "$OUT"
chmod +x "$OUT"
echo "Created $OUT"
