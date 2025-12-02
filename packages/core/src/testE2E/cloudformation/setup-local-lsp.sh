#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to setup local CloudFormation LSP server for E2E tests
# Downloads the latest LSP server release

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

LSP_DIR="$REPO_ROOT/.lsp-server"

echo "Setting up CloudFormation LSP server for E2E tests..."

# Detect platform and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
    darwin) PLATFORM="darwin" ;;
    linux) PLATFORM="linux" ;;
    mingw*|msys*|cygwin*) PLATFORM="win32" ;;
    *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

NODE_VERSION="22"

# Fetch latest release
echo "Fetching latest LSP server release..."
MANIFEST_URL="https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/main/assets/release-manifest.json"

# Try manifest first
if command -v jq &> /dev/null; then
    DOWNLOAD_URL=$(curl -s "$MANIFEST_URL" | jq -r ".prod[0].targets[] | select(.platform == \"$PLATFORM\" and .arch == \"$ARCH\" and .nodejs == \"$NODE_VERSION\") | .contents[0].url")
fi

# Fallback to GitHub API if manifest fails
if [ -z "$DOWNLOAD_URL" ]; then
    echo "Manifest failed, trying GitHub API..."
    RELEASE_URL="https://api.github.com/repos/aws-cloudformation/cloudformation-languageserver/releases/latest"
    DOWNLOAD_URL=$(curl -s "$RELEASE_URL" | grep "browser_download_url.*${PLATFORM}-${ARCH}-node${NODE_VERSION}.zip" | cut -d'"' -f4 | head -1)
fi

if [ -z "$DOWNLOAD_URL" ]; then
    echo "Error: Could not find LSP server release for ${PLATFORM}-${ARCH}-node${NODE_VERSION}"
    exit 1
fi

# Clean and recreate directory
rm -rf "$LSP_DIR"
mkdir -p "$LSP_DIR"
cd "$LSP_DIR"

# Download and extract
echo "Downloading: $DOWNLOAD_URL"
curl -sL -o lsp-server.zip "$DOWNLOAD_URL"
unzip -q lsp-server.zip
rm lsp-server.zip

# Find the actual LSP server file
LSP_FILE=$(find . -name "cfn-lsp-server-standalone.js" | head -1)
if [ -z "$LSP_FILE" ]; then
    echo "Error: cfn-lsp-server-standalone.js not found in extracted files"
    exit 1
fi

LSP_SERVER_DIR=$(dirname "$LSP_FILE")
LSP_SERVER_DIR=$(cd "$LSP_SERVER_DIR" && pwd)
echo "Found LSP server at: $LSP_SERVER_DIR"

# Verify required files
REQUIRED_FILES=("cfn-lsp-server-standalone.js" "package.json" "pyodide-worker.js" "node_modules" "assets" "bin")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -e "$LSP_SERVER_DIR/$file" ]; then
        echo "Warning: $file not found in $LSP_SERVER_DIR"
    fi
done

echo ""
echo "✓ LSP server ready at: $LSP_SERVER_DIR"
echo ""

# Export to GitHub Actions environment if running in CI
if [ -n "$GITHUB_ENV" ]; then
    # Convert to Windows path format if on Windows
    if [[ "$PLATFORM" == "win32" ]]; then
        # Convert /d/path to D:/path format for Node.js on Windows
        WIN_PATH=$(echo "$LSP_SERVER_DIR" | sed 's|^/\([a-z]\)/|\U\1:/|')
        echo "__CLOUDFORMATIONLSP_PATH=$WIN_PATH" >> "$GITHUB_ENV"
        echo "Exported __CLOUDFORMATIONLSP_PATH=$WIN_PATH to GitHub Actions environment"
    else
        echo "__CLOUDFORMATIONLSP_PATH=$LSP_SERVER_DIR" >> "$GITHUB_ENV"
        echo "Exported __CLOUDFORMATIONLSP_PATH=$LSP_SERVER_DIR to GitHub Actions environment"
    fi
fi

echo "Run tests with:"
echo "__CLOUDFORMATIONLSP_PATH=\"$LSP_SERVER_DIR\" npm run testE2E -w packages/toolkit"
