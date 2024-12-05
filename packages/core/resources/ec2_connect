#!/usr/bin/env bash

# Usage:
#   When connecting to a dev environment
#       AWS_REGION=… AWS_SSM_CLI=… STREAM_URL=… TOKEN=… LOG_FILE_LOCATION==… DEBUG_LOG=… ./ec2_connect 

set -e
set -u

_DATE_CMD=true

if command > /dev/null 2>&1 -v date; then
    _DATE_CMD=date
elif command > /dev/null 2>&1 -v /bin/date; then
    _DATE_CMD=/bin/date
fi

_log() {
    echo "$("$_DATE_CMD" '+%Y/%m/%d %H:%M:%S')" "$@" >> "${LOG_FILE_LOCATION}" 2>&1
}

_require_nolog() {
    if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
        _log "error: missing required arg: $1"
        exit 1
    fi
}

_require() {
    _require_nolog "$@"
    _log "$1=$2"
}

_ec2() {
    # Function inputs
    local AWS_SSM_CLI=$1
    local AWS_REGION=$2
    local STREAM_URL=$3
    local TOKEN=$4
    local SESSION_ID=$4

    exec "$AWS_SSM_CLI" "{\"streamUrl\":\"$STREAM_URL\",\"tokenValue\":\"$TOKEN\",\"sessionId\":\"$SESSION_ID\"}" "$AWS_REGION" "StartSession"
}

_main() {
    _log "=============================================================================="
    _require DEBUG_LOG "${DEBUG_LOG:-}"
    _require AWS_REGION "${AWS_REGION:-}"

    _require SESSION_ID "${SESSION_ID:-}"
    _require_nolog STREAM_URL "${STREAM_URL:-}"
    _require_nolog TOKEN "${TOKEN:-}"

    # Only log file paths when debug level is enabled.
    if [ "${DEBUG_LOG:-}" -eq 1 ]; then
        _require AWS_SSM_CLI "${AWS_SSM_CLI:-}"
        _require LOG_FILE_LOCATION "${LOG_FILE_LOCATION:-}"
    else
        _require_nolog AWS_SSM_CLI "${AWS_SSM_CLI:-}"
        _require_nolog LOG_FILE_LOCATION "${LOG_FILE_LOCATION:-}"
    fi

    _ec2 "$AWS_SSM_CLI" "$AWS_REGION" "$STREAM_URL" "$TOKEN" "$SESSION_ID"
}

_main
