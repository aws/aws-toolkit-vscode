#!/bin/env bash

set -e

test -n "$GITHUB_READONLY_TOKEN" || {
    echo 'missing $GITHUB_READONLY_TOKEN'
    exit 1
}

# Authenticate all "git" (and "curl --netrc") github calls, to avoid rate-limiting.
# NOTE: the "login" value is arbitrary.
printf "machine github.com         login oauth password ${GITHUB_READONLY_TOKEN:-unknown}\n" >> "$HOME/.netrc"
printf "machine api.github.com     login oauth password ${GITHUB_READONLY_TOKEN:-unknown}\n" >> "$HOME/.netrc"
printf "machine uploads.github.com login oauth password ${GITHUB_READONLY_TOKEN:-unknown}\n" >> "$HOME/.netrc"
# Print ratelimit info.
curl 2> /dev/null --netrc -L -I https://api.github.com/ | grep x-ratelimit | sed 's/\(.*\)/    \1/'
# Validate ratelimit.
curl 2> /dev/null --netrc -L -I https://api.github.com/ | grep > /dev/null 'x-ratelimit-limit: *[0-9][0-9][0-9][0-9]\+' || {
    echo 'invalid github token, or rate limit too low (expected 5000+)'
    exit 1
}
