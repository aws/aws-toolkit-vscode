#!/bin/env bash

# By default, this script gets the latest VSIX from:
#     https://github.com/aws/aws-toolkit-vscode/releases/
# else the first argument must be a URL or file pointing to a toolkit VSIX or
# ZIP (containing a VSIX).
#
# USAGE:
#     cloud9-toolkit-install.sh [URL|FILE]
#     curl -LO https://raw.githubusercontent.com/aws/aws-toolkit-vscode/master/cloud9-toolkit-install.sh && bash cloud9-toolkit-install.sh
# EXAMPLES:
#     cloud9-toolkit-install.sh https://github.com/aws/aws-toolkit-vscode/releases/download/v1.24.0/aws-toolkit-vscode-1.24.0.vsix
#     cloud9-toolkit-install.sh toolkit.zip

set -eu

# Script currently depends on $HOME so running as root is not supported.
if [ "$(whoami)" = root ]; then
    echo "cannot run as root"
    exit 1
fi

_log() {
    echo >&2 "$@"
}

# Runs whatever is passed.
#
# On failure:
#   - prints the command output
#   - exits the script
_run() {
    local out
    if ! out="$("$@" 2>&1)"; then
        _log "Command failed (output below): '${*}'"
        echo "$out" | sed 's/^/    /'
        _log "Command failed (output above): '${*}'"
        exit 1
    fi
}

# Gets the first existing directory, or exits if none are found.
_any_dir() {
    for d in "$@"; do
        if test -d "$d"; then
            echo "$d"
            return
        fi
    done

    _log "error: None of the expected dirs exist:"
    for d in "$@"; do
        _log "    $d"
    done
    exit 1
}

_setglobals() {
    # Example:
    #     https://github.com/aws/aws-toolkit-vscode/releases/tag/v1.24.0
    TOOLKIT_LATEST_RELEASE_URL="$(curl -Ls -o /dev/null -w '%{url_effective}' 'https://github.com/aws/aws-toolkit-vscode/releases/latest')"
    # Example:
    #     1.24.0
    TOOLKIT_LATEST_VERSION="$(echo "$TOOLKIT_LATEST_RELEASE_URL" | grep -oh '[0-9]\+\.[0-9]\+\.[0-9]\+$')"
    # Example:
    #     https://github.com/aws/aws-toolkit-vscode/releases/download/v1.24.0/aws-toolkit-vscode-1.24.0.vsix
    TOOLKIT_LATEST_ARTIFACT_URL="https://github.com/aws/aws-toolkit-vscode/releases/download/v${TOOLKIT_LATEST_VERSION}/aws-toolkit-vscode-${TOOLKIT_LATEST_VERSION}.vsix"
    # URL or local filepath pointing to toolkit VSIX or ZIP (containing a VSIX).
    TOOLKIT_FILE=${1:-}
    TOOLKIT_INSTALL_PARENT="$(_any_dir "$HOME/.c9/dependencies/aws-toolkit-vscode" "$HOME/environment/.c9/extensions" "$HOME/.c9/aws-toolkit-vscode")"
    # Hash name is 128 chars long.
    TOOLKIT_INSTALL_DIR="$(_any_dir "$(realpath ${TOOLKIT_INSTALL_PARENT}/????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????)" "$(realpath ${TOOLKIT_INSTALL_PARENT}/extension)")"
    SCRIPT_WORKDIR="$HOME/toolkit"
}

_main() {
    (
        if test -f "$TOOLKIT_FILE"; then
            # Ensure full path (before `cd` below).
            TOOLKIT_FILE="$(readlink -f "$TOOLKIT_FILE")"
        fi

        echo "Script will DELETE these directories:"
        echo "    ${TOOLKIT_INSTALL_DIR}"
        echo "    ${SCRIPT_WORKDIR}"
        read -n1 -r -p "ENTER to continue, CTRL-c to cancel"
        rm -rf "${TOOLKIT_INSTALL_DIR}.old"
        mv "$TOOLKIT_INSTALL_DIR" "${TOOLKIT_INSTALL_DIR}.old"
        rm -rf "$SCRIPT_WORKDIR"

        cd "$HOME/"
        mkdir -p "$SCRIPT_WORKDIR"
        mkdir -p "$TOOLKIT_INSTALL_PARENT"
        cd "${SCRIPT_WORKDIR}"

        # Set default URL if no argument was provided.
        if test -z "$TOOLKIT_FILE"; then
            _log "Latest release:"
            _log "    URL    : $TOOLKIT_LATEST_RELEASE_URL"
            _log "    version: $TOOLKIT_LATEST_VERSION"
            _log "    VSIX   : $TOOLKIT_LATEST_ARTIFACT_URL"
            TOOLKIT_FILE="$TOOLKIT_LATEST_ARTIFACT_URL"
        fi

        TOOLKIT_FILE_EXTENSION="${TOOLKIT_FILE: -4}"
        if test -f "$TOOLKIT_FILE"; then
            _log "Local file (not URL): ${TOOLKIT_FILE}"
            if [ "$TOOLKIT_FILE_EXTENSION" = ".zip" ] || [ "$TOOLKIT_FILE_EXTENSION" = ".ZIP" ]; then
                _log 'File is a .zip file'
                _run unzip -- "$TOOLKIT_FILE"
                _run unzip -- *.vsix
            else
                _log 'File is not .zip file, assuming .vsix'
                _run unzip -- "$TOOLKIT_FILE"
            fi
        else
            _log "URL: ${TOOLKIT_FILE}"
            _log 'Deleting toolkit.zip'
            rm -rf toolkit.zip
            _log 'Downloading...'
            curl -o toolkit.zip -L "$TOOLKIT_FILE"
            if [ "$TOOLKIT_FILE_EXTENSION" = ".zip" ] || [ "$TOOLKIT_FILE_EXTENSION" = ".ZIP" ]; then
                _log 'File is a .zip file'
                _run unzip -- toolkit.zip
                _run unzip -- *.vsix
            else
                _log 'File is not .zip file, assuming .vsix'
                _run unzip -- toolkit.zip
            fi
        fi

        mv extension "$TOOLKIT_INSTALL_DIR"
        _log "Toolkit installed to: $TOOLKIT_INSTALL_DIR"
        _log "Refresh Cloud9 to load it"
    )
}

_setglobals "$@"
_main
