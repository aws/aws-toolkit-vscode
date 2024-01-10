#!/bin/env bash

# Common functions used by other CI scripts.
# "Include" this file by sourcing (not executing) it:
#     . buildspec/shared/common.sh

# Ignore these patterns when deciding if the build should fail.
#   - "waiting for browser": from `ssoAccessTokenProvider.test.ts`, unclear how to fix it.
#   - "Webview is disposed": only happens on vscode "minimum" (1.68.0)
#   - "HTTPError: Response code …": caused by github rate-limiting.
_ignore_pat='Timed-out waiting for browser login flow\|HTTPError: Response code 403\|HTTPError: Response code 404'
if [ "$VSCODE_TEST_VERSION" = 'minimum' ]; then
    _ignore_pat="$_ignore_pat"'\|Webview is disposed'
fi

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
    (cat testout &)
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
