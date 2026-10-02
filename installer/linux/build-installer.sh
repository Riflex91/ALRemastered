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

VERSION="$(node -p "JSON.parse(require('fs').readFileSync('build/package/build-info.json','utf8')).version")"
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
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/ALRemastered"
DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/ALRemastered"
INSTALL_RECORD="$CONFIG_ROOT/install-location"
mkdir -p "$DATA_ROOT/logs"
printf 'event=uninstall path=%s\n' "$SELF_DIR" >> "$DATA_ROOT/logs/installer.log"
LINK="$HOME/.local/bin/alremastered"
if [ -L "$LINK" ] && [ "$(readlink "$LINK")" = "$SELF_DIR/alremastered" ]; then rm -f "$LINK"; fi
DESKTOP="$HOME/.local/share/applications/alremastered.desktop"
if [ -f "$DESKTOP" ] && grep -Fq "$SELF_DIR/alremastered" "$DESKTOP"; then rm -f "$DESKTOP"; fi
if [ -f "$INSTALL_RECORD" ] && [ "$(cat "$INSTALL_RECORD")" = "$SELF_DIR" ]; then rm -f "$INSTALL_RECORD"; fi
rm -rf "$SELF_DIR"
echo "ALRemastered was removed. User data was kept."
UNINSTALL
chmod +x "$STAGE/uninstall.sh"

tar -C "$STAGE" -czf "$PAYLOAD" .

cat > "$OUT" <<EOF_HEADER
#!/usr/bin/env sh
set -eu
APP_NAME="ALRemastered"
VERSION="$VERSION"
CONFIG_ROOT="\${XDG_CONFIG_HOME:-\$HOME/.config}/ALRemastered"
DATA_ROOT="\${XDG_DATA_HOME:-\$HOME/.local/share}/ALRemastered"
INSTALL_RECORD="\$CONFIG_ROOT/install-location"
DEFAULT_DIR="\$HOME/.local/opt/ALRemastered"
INSTALL_DIR=""
ASSUME_YES=0
CREATE_DESKTOP=1
RESTART_AFTER_INSTALL=0

mkdir -p "\$CONFIG_ROOT" "\$DATA_ROOT/logs"
if [ -f "\$INSTALL_RECORD" ]; then
  RECORDED_DIR="\$(cat "\$INSTALL_RECORD")"
  if [ -n "\$RECORDED_DIR" ]; then DEFAULT_DIR="\$RECORDED_DIR"; fi
fi

while [ "\$#" -gt 0 ]; do
  case "\$1" in
    --install-dir) INSTALL_DIR="\${2:-}"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --no-desktop) CREATE_DESKTOP=0; shift ;;
    --restart) RESTART_AFTER_INSTALL=1; shift ;;
    --version) echo "\$VERSION"; exit 0 ;;
    *) echo "Unknown option: \$1" >&2; exit 2 ;;
  esac
done

if [ -z "\$INSTALL_DIR" ]; then
  if [ "\$ASSUME_YES" -eq 1 ]; then
    INSTALL_DIR="\$DEFAULT_DIR"
  elif command -v zenity >/dev/null 2>&1 && { [ -n "\${DISPLAY:-}" ] || [ -n "\${WAYLAND_DISPLAY:-}" ]; }; then
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

printf 'event=install_start version=%s path=%s\n' "\$VERSION" "\$INSTALL_DIR" >> "\$DATA_ROOT/logs/installer.log"

TMP_ROOT="\$(mktemp -d)"
UPDATE_DIR="\$INSTALL_DIR/.update"
PREVIOUS_DIR="\$INSTALL_DIR/.previous"
COMMITTED=0

rollback() {
  if [ "\$COMMITTED" -eq 0 ] && [ -d "\$PREVIOUS_DIR" ]; then
    rm -rf "\$INSTALL_DIR/app" "\$INSTALL_DIR/runtime"
    rm -f "\$INSTALL_DIR/alremastered"
    [ -d "\$PREVIOUS_DIR/app" ] && mv "\$PREVIOUS_DIR/app" "\$INSTALL_DIR/app"
    [ -d "\$PREVIOUS_DIR/runtime" ] && mv "\$PREVIOUS_DIR/runtime" "\$INSTALL_DIR/runtime"
    [ -f "\$PREVIOUS_DIR/alremastered" ] && mv "\$PREVIOUS_DIR/alremastered" "\$INSTALL_DIR/alremastered"
    [ -f "\$PREVIOUS_DIR/uninstall.sh" ] && mv "\$PREVIOUS_DIR/uninstall.sh" "\$INSTALL_DIR/uninstall.sh"
    printf 'event=install_rollback version=%s path=%s\n' "\$VERSION" "\$INSTALL_DIR" >> "\$DATA_ROOT/logs/installer.log"
  fi
  rm -rf "\$UPDATE_DIR" "\$TMP_ROOT"
}
trap rollback EXIT HUP INT TERM

ARCHIVE_LINE="\$(awk '/^__ALREMASTERED_ARCHIVE_BELOW__\$/ {print NR + 1; exit}' "\$0")"
if [ -z "\$ARCHIVE_LINE" ]; then echo "Installer payload marker is missing." >&2; exit 1; fi
mkdir -p "\$TMP_ROOT/payload" "\$INSTALL_DIR"
tail -n +"\$ARCHIVE_LINE" "\$0" | tar -xz -C "\$TMP_ROOT/payload"

rm -rf "\$UPDATE_DIR" "\$PREVIOUS_DIR"
mkdir -p "\$UPDATE_DIR" "\$PREVIOUS_DIR"
mv "\$TMP_ROOT/payload/app" "\$UPDATE_DIR/app"
mv "\$TMP_ROOT/payload/runtime" "\$UPDATE_DIR/runtime"
mv "\$TMP_ROOT/payload/alremastered" "\$UPDATE_DIR/alremastered"
mv "\$TMP_ROOT/payload/uninstall.sh" "\$UPDATE_DIR/uninstall.sh"

[ -d "\$INSTALL_DIR/app" ] && mv "\$INSTALL_DIR/app" "\$PREVIOUS_DIR/app"
[ -d "\$INSTALL_DIR/runtime" ] && mv "\$INSTALL_DIR/runtime" "\$PREVIOUS_DIR/runtime"
[ -f "\$INSTALL_DIR/alremastered" ] && mv "\$INSTALL_DIR/alremastered" "\$PREVIOUS_DIR/alremastered"
[ -f "\$INSTALL_DIR/uninstall.sh" ] && mv "\$INSTALL_DIR/uninstall.sh" "\$PREVIOUS_DIR/uninstall.sh"

mv "\$UPDATE_DIR/app" "\$INSTALL_DIR/app"
mv "\$UPDATE_DIR/runtime" "\$INSTALL_DIR/runtime"
mv "\$UPDATE_DIR/alremastered" "\$INSTALL_DIR/alremastered"
mv "\$UPDATE_DIR/uninstall.sh" "\$INSTALL_DIR/uninstall.sh"
rm -rf "\$UPDATE_DIR"
COMMITTED=1

printf '%s\n' "\$INSTALL_DIR" > "\$INSTALL_RECORD"
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

printf 'event=install_success version=%s path=%s\n' "\$VERSION" "\$INSTALL_DIR" >> "\$DATA_ROOT/logs/installer.log"
printf 'ALRemastered %s was installed successfully.\n' "\$VERSION"
printf 'Installation folder: %s\n' "\$INSTALL_DIR"
printf 'User data folder: %s\n' "\$DATA_ROOT"
printf 'Run: %s/alremastered\n' "\$INSTALL_DIR"
trap - EXIT HUP INT TERM
rm -rf "\$TMP_ROOT"

if [ "\$RESTART_AFTER_INSTALL" -eq 1 ]; then
  nohup "\$INSTALL_DIR/alremastered" --no-open-dashboard >/dev/null 2>&1 &
fi

exit 0
__ALREMASTERED_ARCHIVE_BELOW__
EOF_HEADER
cat "$PAYLOAD" >> "$OUT"
chmod +x "$OUT"
echo "Created $OUT"
