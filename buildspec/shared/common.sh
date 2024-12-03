#!/bin/env bash

# Common functions used by other CI scripts.
# "Include" this file by sourcing (not executing) it:
#     . buildspec/shared/common.sh

# Ignore these patterns when deciding if the build should fail.
#   - "waiting for browser": from `ssoAccessTokenProvider.test.ts`, unclear how to fix it.
#   - "HTTPError: Response code …": caused by github rate-limiting.
#   - "npm WARN deprecated querystring": transitive dep of aws sdk v2 (check `npm ls querystring`), so that's blocked until we migrate to v3.
_ignore_pat='HTTPError: Response code 403\|HTTPError: Response code 404\|npm WARN deprecated querystring\|npm WARN deprecated'

# Do not print (noisy) lines matching these patterns.
#   - "ERROR:bus… Failed to connect to the bus": noise related to "xvfb". https://github.com/cypress-io/cypress/issues/19299
_discard_pat='ERROR:bus.cc\|ERROR:viz_main_impl.cc\|ERROR:command_buffer_proxy_impl.cc'

# Expects stdin + two args:
#   1: error code to return on failure
#   2: grep pattern
#   3: message shown at end of report, if pattern was found in stdin.
# Usage:
#   echo foo | run_and_report 1 '.*' 'You must fix this. See https://example.com'
run_and_report() {
    set -o pipefail
    local errcode="${1}"
    local pat="${2}"
    local msg="${3}"
    local r=0
    mkfifo testout
    (grep -v "$_discard_pat" testout &)
    # Capture messages that we may want to fail (or report) later.
    tee testout \
        | { grep > testout-err --line-buffered -E "$pat" || true; }

    echo ''

    if grep -v "${_ignore_pat}" testout-err | grep "$pat" | sort; then
        printf '\nERROR: Test output matched this pattern %s times:\n       "%s"\n%s\n\n' \
            "$(grep -c "${pat}" testout-err)" \
            "$pat" \
            "       ${msg}"
        r=${errcode}
    else
        printf '\nOK: Not found in test output: "%s"\n' "$pat"
    fi

    rm -f testout testout-err
    return "$r"
}
