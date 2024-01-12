#!/bin/env bash

# Common code for "install" phase of linux codebuild CI job.

set -e

set +x
test -n "$VSCODE_TEST_VERSION" || {
    echo 'missing $VSCODE_TEST_VERSION'
    exit 1
}
set -x

# Without this, "Unable to locate package libatk1.0-0".
apt-get > /dev/null -yqq update
# Dependencies for running vscode.
apt-get > /dev/null -yqq install libatk1.0-0 libgtk-3-dev libxss1 xvfb libasound2 libasound2-plugins

#
# Prepare env for unprivileged user. We cannot run vscode as root.
#
# "codebuild-user": https://github.com/aws/aws-codebuild-docker-images/blob/2f796bb9c81fcfbc8585832b99a5f780ae2b2f52/ubuntu/standard/6.0/Dockerfile#L56
mkdir -p ~codebuild-user
chown -R codebuild-user:codebuild-user /tmp ~codebuild-user .
chmod +x ~codebuild-user
ls -ld ~codebuild-user
