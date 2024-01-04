#!/bin/env bash

# Common code for "pre_build" phase of linux codebuild CI job.

set -e
set -o pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Include common functions.
. "${_SCRIPT_DIR}/common.sh"

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
npm 2>&1 ci | run_and_report 'npm WARN deprecated' 'Deprecated dependencies must be updated.'
# TODO: fail the CI job
# || { echo ''; exit 1; }
