#!/bin/env bash

# Common code for "pre_build" phase of linux codebuild CI job.

set -e
# Ensure that "foo | run_and_report" fails correctly.
set -o pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Include common functions.
. "${_SCRIPT_DIR}/common.sh"

# Set up GitHub token for vscode-ripgrep to avoid rate limiting
if [ -n "$GITHUB_TOKEN" ]; then
    echo "GITHUB_TOKEN is set. vscode-ripgrep will use this for GitHub API authentication."
else
    echo "WARNING: GITHUB_TOKEN is not set. GitHub API requests may be rate-limited."
fi

# If present, log into CodeArtifact. Provides a fallback in case NPM is down.
# Should only affect tests run through Toolkits-hosted CodeBuild.
if [ "$TOOLKITS_CODEARTIFACT_DOMAIN" ] && [ "$TOOLKITS_CODEARTIFACT_REPO" ] && [ "$TOOLKITS_ACCOUNT_ID" ]; then
    if aws codeartifact login --tool npm --domain "$TOOLKITS_CODEARTIFACT_DOMAIN" --domain-owner "$TOOLKITS_ACCOUNT_ID" --repository "$TOOLKITS_CODEARTIFACT_REPO" > /dev/null 2>&1; then
        echo "Connected to CodeArtifact"
    else
        echo "CodeArtifact connection failed. Falling back to npm"
    fi
fi

# TODO: move this to the "install" phase?
export NODE_OPTIONS='--max-old-space-size=8192'
npm 2>&1 ci | run_and_report 2 'npm WARN deprecated' 'Deprecated dependencies must be updated.'
