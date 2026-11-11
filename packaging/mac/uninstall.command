#!/bin/bash
# Removes Pesa Ledger from this Mac. Your figures (~/.pesa-ledger) are kept unless you say otherwise.
set -uo pipefail

ROOT="$HOME/Library/Application Support/Pesa Ledger"
APP="$HOME/Applications/Pesa Ledger.app"
PY="$ROOT/app/.pixi/envs/default/bin/python"
DATA="$HOME/.pesa-ledger"

clear 2>/dev/null || true
echo "Uninstall Pesa Ledger"
echo "─────────────────────────"
read -rp "Remove Pesa Ledger from this Mac? [y/N] " yes
[[ "$yes" =~ ^[Yy] ]] || { echo "Nothing was changed."; exit 0; }

if [ -x "$PY" ]; then
  (cd "$ROOT/app" && "$PY" -m pesa_ledger.launch --stop) >/dev/null 2>&1 || true
  (cd "$ROOT/app" && "$PY" -m pesa_ledger.autostart uninstall) >/dev/null 2>&1 || true
fi
pkill -f "$ROOT/app/.pixi/envs/default/bin/python" 2>/dev/null || true  # only this installation's ledger
rm -rf "$APP"
rm -rf "$ROOT"
echo "✓ Removed the app and its files."

if [ -d "$DATA" ]; then
  echo
  echo "Your figures, settings and backups are in $DATA."
  read -rp "Delete them too? This can't be undone. [y/N] " wipe
  if [[ "$wipe" =~ ^[Yy] ]]; then
    rm -rf "$DATA"
    echo "✓ Deleted."
  else
    echo "Kept. Installing Pesa Ledger again picks them up."
  fi
fi
echo
read -n1 -rsp "Press any key to close this window."
echo
