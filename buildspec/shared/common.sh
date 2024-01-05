# Common functions used by other CI scripts.
# "Include" this file by sourcing (not executing) it:
#     . buildspec/shared/common.sh

# Expects stdin + two args:
#   1: grep pattern
#   2: message shown at end of report, if pattern was found in stdin.
# Usage:
#   echo foo | run_and_report '.*' 'You must fix this. See https://example.com'
run_and_report() {
    set -o pipefail
    local pat="${1}"
    local msg="${2}"
    local r=0
    mkfifo testout
    (cat testout &)
    # Capture messages that we may want to fail (or report) later.
    tee testout \
        | { grep > testout-err --line-buffered -E "$pat" || true; }
    echo ''
    if grep "$pat" testout-err | sort; then
        printf '\nERROR: Found %s "%s" in test output (see above).\n%s\n\n' \
            "$(grep "${pat}" testout-err | wc -l | tr -d ' ')" \
            "$pat" \
            "       ${msg}"
        # TODO: fail the CI job
        # r=1
        r=0
    fi
    rm -f testout testout-err
    return "$r"
}
