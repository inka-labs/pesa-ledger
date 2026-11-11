#!/bin/bash
# Installs, or updates, Pesa Ledger for this Mac user. Double-click it (first time: right-click > Open).
#
#   ~/Library/Application Support/Pesa Ledger/   app/ (the ledger and its environment), bin/pixi
#   ~/Applications/Pesa Ledger.app               opens the ledger (starts it if needed, signs you in)
#   ~/.pesa-ledger/                              your figures, settings and backups (never touched here)
#
# No administrator password; nothing outside your home folder is touched. Built by packaging/build_release.py.
# PESA_LEDGER_UNATTENDED=1: no prompts, and the ledger is started again in the background, not opened.
set -euo pipefail

PIXI_VERSION="__PIXI_VERSION__"
APP_VERSION="__APP_VERSION__"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HOME/Library/Application Support/Pesa Ledger"
APP="$HOME/Applications/Pesa Ledger.app"
PY="$ROOT/app/.pixi/envs/default/bin/python"
UNATTENDED="${PESA_LEDGER_UNATTENDED:-}"

finish() {
  [ -n "$UNATTENDED" ] && return
  echo
  read -n1 -rsp "Press any key to close this window." || true
  echo
}
fail() {
  echo
  echo "✗ $1"
  echo
  echo "  Your figures weren't touched: they're in ~/.pesa-ledger."
  if [ -n "$UNATTENDED" ] && [ -x "$PY" ]; then
    (cd "$ROOT/app" && "$PY" -m pesa_ledger.launch --no-browser >/dev/null) || true  # back as it was, if it can be
  fi
  finish
  exit 1
}
trap 'fail "The installation stopped (see the messages above). Check your internet connection and try again."' ERR

[ -n "$UNATTENDED" ] || clear 2>/dev/null || true
echo "Pesa Ledger $APP_VERSION ($(date))"
echo "──────────────────────────────"
[ -f "$HERE/app/pixi.toml" ] || fail "Open this from the unzipped Pesa Ledger folder (its app folder is missing)."

mkdir -p "$ROOT/bin"

# 1. pixi: installs Python and the packages the ledger uses, inside its own folder.
if [ "$("$ROOT/bin/pixi" --version 2>/dev/null || true)" != "pixi $PIXI_VERSION" ]; then
  case "$(uname -m)" in
    arm64) TARGET=aarch64-apple-darwin ;;
    *) TARGET=x86_64-apple-darwin ;;
  esac
  echo "→ Downloading pixi $PIXI_VERSION (it installs Python and the packages the ledger uses)…"
  curl -fsSL --proto '=https' --tlsv1.2 "https://github.com/prefix-dev/pixi/releases/download/v$PIXI_VERSION/pixi-$TARGET.tar.gz" | tar -xz -C "$ROOT/bin" pixi
  chmod +x "$ROOT/bin/pixi"
fi

# 2. An update: stop the ledger that's running (it saves as it goes, so nothing is lost).
if [ -x "$PY" ]; then
  (cd "$ROOT/app" && "$PY" -m pesa_ledger.launch --stop) || true
fi

# 3. The ledger's files (its environment, .pixi, is kept so an update is quick).
echo "→ Copying Pesa Ledger…"
mkdir -p "$ROOT/app"
rsync -a --delete --exclude "/.pixi/" "$HERE/app/" "$ROOT/app/"

# 4. Its own Python and packages, exactly as locked.
echo "→ Installing Python and the packages (a few minutes the first time)…"
"$ROOT/bin/pixi" install --manifest-path "$ROOT/app/pixi.toml" --frozen

# 5. The app you open it with.
echo "→ Adding Pesa Ledger to your Applications…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ROOT/app/packaging/mac/icon.icns" "$APP/Contents/Resources/icon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Pesa Ledger</string>
  <key>CFBundleDisplayName</key><string>Pesa Ledger</string>
  <key>CFBundleIdentifier</key><string>app.pesaledger.desktop.launcher</string>
  <key>CFBundleVersion</key><string>$APP_VERSION</string>
  <key>CFBundleShortVersionString</key><string>$APP_VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>PesaLedger</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
cat > "$APP/Contents/MacOS/PesaLedger" <<LAUNCH
#!/bin/bash
# Opens Pesa Ledger: starts it in the background if needed, then opens it in your browser.
cd "$ROOT/app" && exec "$PY" -m pesa_ledger.launch
LAUNCH
chmod +x "$APP/Contents/MacOS/PesaLedger"
touch "$APP"

# 6. The uninstaller, next to the ledger.
cp "$ROOT/app/packaging/mac/uninstall.command" "$ROOT/Uninstall Pesa Ledger.command"
chmod +x "$ROOT/Uninstall Pesa Ledger.command"

trap - ERR
echo
if [ -n "$UNATTENDED" ]; then
  echo "✓ Pesa Ledger $APP_VERSION is installed. Starting it again…"
  cd "$ROOT/app" && "$PY" -m pesa_ledger.launch --no-browser >/dev/null  # prints the sign-in link: not for a log
  exit 0
fi
echo "✓ Pesa Ledger $APP_VERSION is installed. Opening it in your browser…"
echo "  Next time, open Pesa Ledger from Applications (or Spotlight: ⌘ Space, type Pesa)."
open "$APP"
sleep 2
finish
