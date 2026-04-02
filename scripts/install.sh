#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AI TestCase Generator — Universal Installer
# Supports: npm · local · Docker · Homebrew · pip (wrapper) · apt (deb) · go
#
# Usage:
#   ./scripts/install.sh            → auto-detect best method
#   ./scripts/install.sh --npm      → global npm install
#   ./scripts/install.sh --docker   → Docker Compose
#   ./scripts/install.sh --local    → local dev mode
# ─────────────────────────────────────────────────────────────────────────────

set -e

PKG_NAME="testcase-generator"
VERSION="1.0.0"
REPO="https://github.com/XuXuClassMate/testcase-generator"
CYAN="\033[0;36m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

info()    { echo -e "${CYAN}ℹ  $*${NC}"; }
success() { echo -e "${GREEN}✅ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠  $*${NC}"; }
error()   { echo -e "${RED}❌ $*${NC}"; exit 1; }

echo ""
echo -e "${CYAN}AI TestCase Generator v${VERSION} — Installer${NC}"
echo "──────────────────────────────────────────────────"
echo ""

MODE="${1:-auto}"

# ── Auto-detect ────────────────────────────────────────────────────────────────
if [ "$MODE" = "auto" ]; then
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    MODE="--docker"
  elif command -v npm &>/dev/null; then
    MODE="--npm"
  elif command -v brew &>/dev/null; then
    MODE="--brew"
  else
    MODE="--local"
  fi
  info "Auto-detected install method: $MODE"
fi

# ── npm (global) ──────────────────────────────────────────────────────────────
install_npm() {
  info "Installing via npm..."
  command -v node &>/dev/null || error "Node.js is required. Install from https://nodejs.org"
  node_ver=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>&1) || \
    error "Node.js ≥ 18 required. Current: $(node --version)"

  npm install -g "$PKG_NAME" 2>/dev/null || {
    warn "npm global install failed, trying local..."
    npm install
    success "Installed locally. Run with: npx testcase-generator --standalone"
    return
  }
  success "Installed globally. Run with: testcase-generator --standalone"
  print_env_reminder
}

# ── Docker ────────────────────────────────────────────────────────────────────
install_docker() {
  info "Installing via Docker..."
  command -v docker &>/dev/null || error "Docker not found. Install from https://docker.com"

  if [ ! -f "docker-compose.yml" ]; then
    warn "docker-compose.yml not found, downloading..."
    curl -sSL "$REPO/raw/main/docker-compose.yml" -o docker-compose.yml
  fi

  if [ ! -f ".env" ]; then
    cat > .env <<EOF
AI_PROVIDER=claude
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
LANGUAGE=en
PORT=3456
ENABLE_REVIEW=true
EOF
    warn ".env file created. Please fill in your API keys before starting."
  fi

  docker compose pull 2>/dev/null || docker compose build
  success "Docker image ready."
  info "Start with: docker compose up -d"
  info "Web UI:     http://localhost:3456"
}

# ── Homebrew (macOS/Linux) ────────────────────────────────────────────────────
install_brew() {
  info "Installing via Homebrew..."
  command -v brew &>/dev/null || error "Homebrew not found. Install from https://brew.sh"
  warn "Homebrew tap not yet published. Falling back to npm install."
  install_npm
}

# ── Local dev ─────────────────────────────────────────────────────────────────
install_local() {
  info "Installing locally (development mode)..."
  command -v node &>/dev/null || error "Node.js ≥ 18 required."
  command -v npm &>/dev/null || error "npm required."

  [ -f "package.json" ] || { git clone "$REPO" . 2>/dev/null || error "Not in a valid project directory."; }

  npm install
  npm run build

  success "Built successfully."
  info "Start standalone: npm run standalone"
  info "OpenClaw plugin: openclaw plugins install -l ."
  print_env_reminder
}

# ── apt (Debian/Ubuntu) ───────────────────────────────────────────────────────
install_apt() {
  info "Checking apt prerequisites..."
  # Install node via nodesource if needed
  if ! command -v node &>/dev/null; then
    info "Installing Node.js 20 via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  # Install ffmpeg
  sudo apt-get install -y ffmpeg 2>/dev/null || warn "ffmpeg install failed (video support disabled)"
  install_npm
}

# ── pip wrapper (Python users) ────────────────────────────────────────────────
install_pip() {
  info "pip mode: installing Node.js wrapper..."
  command -v pip &>/dev/null || error "pip not found."
  warn "pip installation is a thin wrapper that requires Node.js."
  pip install testcase-generator-ai 2>/dev/null || {
    warn "pip package not yet published, using npm instead."
    install_npm
  }
}

# ── go install ────────────────────────────────────────────────────────────────
install_go() {
  info "go mode: installing CLI proxy..."
  command -v go &>/dev/null || error "Go not found."
  warn "Go package not yet published, using npm instead."
  install_npm
}

# ── Env reminder ──────────────────────────────────────────────────────────────
print_env_reminder() {
  echo ""
  echo -e "${YELLOW}⚙  Set your API keys before starting:${NC}"
  echo ""
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  echo "  export OPENAI_API_KEY=sk-..."
  echo "  export DEEPSEEK_API_KEY=..."
  echo ""
  echo "  # Optional:"
  echo "  export AI_PROVIDER=claude    # claude|openai|deepseek|minimax"
  echo "  export LANGUAGE=en           # en|zh"
  echo "  export PORT=3456"
  echo ""
}

# ── OpenClaw check ────────────────────────────────────────────────────────────
check_openclaw() {
  if command -v openclaw &>/dev/null; then
    echo ""
    info "OpenClaw detected! To install as plugin:"
    echo "  openclaw plugins install -l $(pwd)"
    echo "  openclaw gateway restart"
    echo "  openclaw plugins list"
  fi
}

# ── ffmpeg check ──────────────────────────────────────────────────────────────
check_ffmpeg() {
  if ! command -v ffmpeg &>/dev/null; then
    warn "ffmpeg not found — video parsing will be disabled."
    echo "  Install: brew install ffmpeg  |  apt install ffmpeg  |  choco install ffmpeg"
  fi
}

# ── Run ───────────────────────────────────────────────────────────────────────
case "$MODE" in
  --npm)    install_npm ;;
  --docker) install_docker ;;
  --brew)   install_brew ;;
  --local)  install_local ;;
  --apt)    install_apt ;;
  --pip)    install_pip ;;
  --go)     install_go ;;
  *)        error "Unknown mode: $MODE. Use --npm|--docker|--brew|--local|--apt|--pip|--go" ;;
esac

check_ffmpeg
check_openclaw

echo ""
success "Installation complete!"
echo ""
