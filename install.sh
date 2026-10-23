#!/usr/bin/env bash
# ==============================================================================
# OctaDigital: Paperclip Community Enhancements Installer
# All-in-one patches, adapters and runtime improvements for Paperclip
# Repo: https://github.com/octadigitalia/paperclip-enhancements
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RESET="\033[0m"

echo -e "${BLUE}${BOLD}====================================================================${RESET}"
echo -e "${BLUE}${BOLD}       OctaDigital : Paperclip Enhancements Installer               ${RESET}"
echo -e "${BLUE}${BOLD}====================================================================${RESET}"

TARGET_DIR="${PAPERCLIP_HOME:-/paperclip}"
TMP_DIR="/tmp/paperclip-enhancements-src"

echo -e "\n${YELLOW}[1/6] Detecting environment and directories...${RESET}"
if [ ! -d "$TARGET_DIR" ]; then
    echo "Target directory $TARGET_DIR does not exist. Creating..."
    mkdir -p "$TARGET_DIR"
fi

mkdir -p "$TARGET_DIR/adapters"
mkdir -p "$TMP_DIR"

echo -e "\n${YELLOW}[2/6] Downloading latest enhancements from GitHub...${RESET}"
TARBALL_URL="https://github.com/octadigitalia/paperclip-enhancements/archive/refs/heads/main.tar.gz"
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMP_DIR" --strip-components=1
elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$TARBALL_URL" | tar -xz -C "$TMP_DIR" --strip-components=1
else
    echo "Error: curl or wget is required to download package." >&2
    exit 1
fi

echo -e "\n${YELLOW}[3/6] Installing adapters to $TARGET_DIR/adapters...${RESET}"
if [ -d "$TMP_DIR/adapters/antigravity-local" ]; then
    rm -rf "$TARGET_DIR/adapters/antigravity-local"
    cp -r "$TMP_DIR/adapters/antigravity-local" "$TARGET_DIR/adapters/"
    echo -e "${GREEN}Google Antigravity adapter installed successfully.${RESET}"
fi

if [ -d "$TMP_DIR/adapters/opencode-local/src" ] && [ -d "/app/packages/adapters/opencode-local/src" ]; then
    cp -r "$TMP_DIR/adapters/opencode-local/src/"* "/app/packages/adapters/opencode-local/src/"
    echo -e "${GREEN}OpenCode local adapter updated successfully.${RESET}"
fi

echo -e "\n${YELLOW}[4/6] Registering adapter plugins in $TARGET_DIR/adapter-plugins.json...${RESET}"
node - << 'NODE_SCRIPT'
const fs = require('fs');
const path = require('path');

const targetDir = process.env.TARGET_DIR || process.env.PAPERCLIP_HOME || '/paperclip';
const pluginsJsonPath = path.join(targetDir, 'adapter-plugins.json');

let plugins = [];
if (fs.existsSync(pluginsJsonPath)) {
    try {
        plugins = JSON.parse(fs.readFileSync(pluginsJsonPath, 'utf8'));
        if (!Array.isArray(plugins)) plugins = [];
    } catch {
        plugins = [];
    }
}

const antigravityEntry = {
    packageName: path.join(targetDir, 'adapters/antigravity-local'),
    localPath: path.join(targetDir, 'adapters/antigravity-local'),
    version: '0.3.1',
    type: 'antigravity_local',
    installedAt: new Date().toISOString()
};

const existingIndex = plugins.findIndex(p => p.type === 'antigravity_local' || (p.packageName && p.packageName.includes('antigravity-local')));
if (existingIndex >= 0) {
    plugins[existingIndex] = Object.assign({}, plugins[existingIndex], antigravityEntry);
} else {
    plugins.push(antigravityEntry);
}

fs.writeFileSync(pluginsJsonPath, JSON.stringify(plugins, null, 2), 'utf8');
console.log('Registered antigravity_local in adapter-plugins.json');
NODE_SCRIPT

echo -e "\n${YELLOW}[5/6] Installing and executing runtime patches...${RESET}"
cp "$TMP_DIR/patches/apply_patches.cjs" "$TARGET_DIR/apply_patches.cjs"

if [ -f "$TARGET_DIR/apply_patches.cjs" ] && command -v node >/dev/null 2>&1; then
    echo "Executing patches on running Paperclip instance..."
    node "$TARGET_DIR/apply_patches.cjs"
    echo -e "${GREEN}Runtime patches applied successfully.${RESET}"
fi

echo -e "\n${YELLOW}[6/6] Setting up container boot persistence and permissions...${RESET}"
ENTRYPOINT="/usr/local/bin/docker-entrypoint.sh"
if [ -f "$ENTRYPOINT" ] && [ -w "$ENTRYPOINT" ]; then
    if ! grep -q "apply_patches.cjs" "$ENTRYPOINT"; then
        sed -i '/exec gosu node/i if [ -f "'"$TARGET_DIR"'/apply_patches.cjs" ]; then\n    node "'"$TARGET_DIR"'/apply_patches.cjs"\nfi\n' "$ENTRYPOINT"
        echo -e "${GREEN}Boot hook installed in docker-entrypoint.sh.${RESET}"
    else
        echo "Boot hook already present in docker-entrypoint.sh."
    fi
fi

if [ "$(id -u)" -eq 0 ] && id "node" >/dev/null 2>&1; then
    chown -R node:node "$TARGET_DIR"
fi

rm -rf "$TMP_DIR"

echo -e "\n${BLUE}${BOLD}====================================================================${RESET}"
echo -e "${GREEN}${BOLD}Installation Complete!${RESET}"
echo -e "${BLUE}${BOLD}Features Activated:${RESET}"
echo -e "  - Google Antigravity Local Adapter with real-time events and MCP"
echo -e "  - OpenCode Local Adapter with reasoning cleanup and instruction persistence"
echo -e "  - Claude Sonnet 3.5 / 3.7 / Haiku models support"
echo -e "  - Unrestricted custom AI providers compatibility"
echo -e "  - UI Parser UTF-8 accentuation and intermediate thinking folding"
echo -e "  - Instruction and memory auto-sync (onProviderStopped hook)"
echo -e "${BLUE}${BOLD}====================================================================${RESET}\n"
