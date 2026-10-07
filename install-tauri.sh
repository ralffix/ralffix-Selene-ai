#!/usr/bin/env bash
# Selene setup: installs the system libraries Tauri needs, Rust, and the npm packages.
# Supports Arch-based, Debian/Ubuntu-based and Fedora-based Linux.
# Usage: ./install-tauri.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "  Selene: setup"
echo "============================================"
echo

# ── 1. System libraries ─────────────────────────
echo "[1/4] Installing system libraries (you may be asked for your password)..."
if command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
    appmenu-gtk-module libappindicator-gtk3 librsvg xdotool
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
    libappindicator-gtk3-devel librsvg2-devel libxdo-devel
  sudo dnf group install -y "c-development"
else
  echo "  Could not recognise your package manager."
  echo "  Install the Tauri prerequisites for your distro by hand:"
  echo "  https://v2.tauri.app/start/prerequisites/#linux"
  echo "  Then run this script again, or just run: npm install"
  exit 1
fi
echo "  Done."
echo

# ── 2. Rust ─────────────────────────────────────
echo "[2/4] Checking Rust..."
if command -v rustc >/dev/null 2>&1; then
  echo "  Rust is already installed ($(rustc --version))"
else
  echo "  Installing Rust with rustup (https://rustup.rs)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
  echo "  Installed ($(rustc --version))"
fi
echo

# ── 3. Node.js ──────────────────────────────────
echo "[3/4] Checking Node.js..."
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "  Node.js 20 or newer is needed. Install it from your package manager or https://nodejs.org/"
  echo "  Then run this script again."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  Node.js $(node -v) is too old. Please install version 20 or newer."
  exit 1
fi
echo "  Node.js $(node -v)"
echo

# ── 4. npm packages ─────────────────────────────
echo "[4/4] Installing npm packages in $SCRIPT_DIR ..."
cd "$SCRIPT_DIR"
npm install
echo

echo "============================================"
echo "  All set. Start Selene with:"
echo
echo "    npm run tauri dev"
echo
echo "  (the first build takes a few minutes)"
echo "============================================"
