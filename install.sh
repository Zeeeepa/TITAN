#!/usr/bin/env bash
# TITAN — One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Djtony707/TITAN/main/install.sh | bash
#
# This script:
#   1. Detects OS and architecture
#   2. Checks for Node.js >= 20 (installs via nvm if missing)
#   3. Installs titan-agent globally via npm
#   4. Runs the onboarding wizard
#
# Environment variables:
#   TITAN_SKIP_ONBOARD=1  — skip the interactive wizard
#   TITAN_VERSION=x.y.z   — install a specific version

set -euo pipefail

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

REQUIRED_NODE_MAJOR=20
PACKAGE_NAME="titan-agent"

log()   { echo -e "${CYAN}[TITAN]${RESET} $1"; }
ok()    { echo -e "${GREEN}  ✓${RESET} $1"; }
warn()  { echo -e "${YELLOW}  ⚠${RESET} $1"; }
fail()  { echo -e "${RED}  ✗ $1${RESET}"; exit 1; }

# ─── Banner ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ████████╗██╗████████╗ █████╗ ███╗   ██╗"
echo "     ██║   ██║   ██║   ██╔══██╗████╗  ██║"
echo "     ██║   ██║   ██║   ███████║██╔██╗ ██║"
echo "     ██║   ██║   ██║   ██╔══██║██║╚██╗██║"
echo "     ██║   ██║   ██║   ██║  ██║██║ ╚████║"
echo "     ╚═╝   ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝"
echo -e "${RESET}"
echo -e "  ${BOLD}The Intelligent Task Automation Network${RESET}"
echo ""

# ─── Detect OS ────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *) fail "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
    x86_64|amd64) ARCH_LABEL="x64" ;;
    arm64|aarch64) ARCH_LABEL="arm64" ;;
    *) ARCH_LABEL="$ARCH" ;;
esac

log "Detected: ${PLATFORM} (${ARCH_LABEL})"

# ─── Check Node.js ────────────────────────────────────────────
check_node() {
    if command -v node &>/dev/null; then
        NODE_VERSION="$(node -v | sed 's/^v//')"
        NODE_MAJOR="${NODE_VERSION%%.*}"
        if [ "$NODE_MAJOR" -ge "$REQUIRED_NODE_MAJOR" ]; then
            ok "Node.js v${NODE_VERSION} found"
            return 0
        else
            warn "Node.js v${NODE_VERSION} found, but v${REQUIRED_NODE_MAJOR}+ required"
            return 1
        fi
    else
        warn "Node.js not found"
        return 1
    fi
}

install_node() {
    log "Installing Node.js v${REQUIRED_NODE_MAJOR} via nvm..."

    if command -v nvm &>/dev/null; then
        nvm install "$REQUIRED_NODE_MAJOR"
        nvm use "$REQUIRED_NODE_MAJOR"
    else
        # Install nvm first
        log "Installing nvm..."
        curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

        # Source nvm
        export NVM_DIR="${HOME}/.nvm"
        # shellcheck source=/dev/null
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

        nvm install "$REQUIRED_NODE_MAJOR"
        nvm use "$REQUIRED_NODE_MAJOR"
    fi

    if ! check_node; then
        fail "Failed to install Node.js. Please install Node.js >= ${REQUIRED_NODE_MAJOR} manually: https://nodejs.org/"
    fi
}

if ! check_node; then
    install_node
fi

# ─── Check npm ────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
    fail "npm not found. Please install Node.js >= ${REQUIRED_NODE_MAJOR}: https://nodejs.org/"
fi
ok "npm $(npm -v) found"

# ─── Install TITAN ────────────────────────────────────────────
VERSION_SPEC="${TITAN_VERSION:+@$TITAN_VERSION}"

log "Installing ${PACKAGE_NAME}${VERSION_SPEC:-@latest}..."
npm install -g "${PACKAGE_NAME}${VERSION_SPEC:-}" 2>&1 | tail -5

if ! command -v titan &>/dev/null; then
    # npm global bin might not be in PATH
    NPM_BIN="$(npm config get prefix)/bin"
    if [ -x "${NPM_BIN}/titan" ]; then
        warn "titan installed but not in PATH. Add this to your shell profile:"
        echo ""
        echo "  export PATH=\"${NPM_BIN}:\$PATH\""
        echo ""
    else
        fail "Installation failed. Try: npm install -g ${PACKAGE_NAME}"
    fi
else
    INSTALLED_VERSION="$(titan --version 2>/dev/null || echo 'unknown')"
    ok "titan v${INSTALLED_VERSION} installed"
fi

# ─── Create TITAN home ────────────────────────────────────────
TITAN_HOME="${TITAN_HOME:-$HOME/.titan}"
mkdir -p "$TITAN_HOME"
ok "TITAN home: ${TITAN_HOME}"

# ─── Run onboarding ──────────────────────────────────────────
if [ "${TITAN_SKIP_ONBOARD:-}" = "1" ]; then
    log "Skipping onboarding (TITAN_SKIP_ONBOARD=1)"
else
    echo ""
    log "Launching onboarding wizard..."
    echo ""
    if command -v titan &>/dev/null; then
        titan onboard || true
    fi
fi

# ─── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  TITAN installed successfully!${RESET}"
echo ""
echo "  Quick start:"
echo "    titan gateway      — start the gateway server"
echo "    titan send \"hi\"    — send a message from CLI"
echo "    titan doctor       — run system diagnostics"
echo "    titan --help       — see all commands"
echo ""
echo "  Dashboard: http://localhost:48420"
echo ""
