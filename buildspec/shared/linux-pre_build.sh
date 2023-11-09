#!/bin/env bash

# Common code for "pre_build" phase of linux codebuild CI job.

set -e

# If present, log into CodeArtifact. Provides a fallback in case NPM is down.
# Should only affect tests run through Toolkits-hosted CodeBuild.
if [ "$TOOLKITS_CODEARTIFACT_DOMAIN" ] && [ "$TOOLKITS_CODEARTIFACT_REPO" ] && [ "$TOOLKITS_ACCOUNT_ID" ]; then
    if aws codeartifact login --tool npm --domain "$TOOLKITS_CODEARTIFACT_DOMAIN" --domain-owner "$TOOLKITS_ACCOUNT_ID" --repository "$TOOLKITS_CODEARTIFACT_REPO" > /dev/null 2>&1; then
        echo "Connected to CodeArtifact"
    else
        echo "CodeArtifact connection failed. Falling back to npm"
    fi
fi

# TODO: do this in the "install" phase?
npm ci
