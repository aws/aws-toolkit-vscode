# Windows counterpart of `ec2_connect`. Invoked by ssh as a ProxyCommand.
#
# Usage:
#   When connecting to an EC2 instance
#       $Env:AWS_REGION=... $Env:AWS_SSM_CLI=... $Env:STREAM_URL=... $Env:TOKEN=... $Env:SESSION_ID=... $Env:LOG_FILE_LOCATION=... $Env:DEBUG_LOG=... ./ec2_connect.ps1 <hostname>
#
# NOTE: stdout of this script is the SSH data stream. Never write to stdout; log to LOG_FILE_LOCATION instead.

param (
    [string] $HostName
)

# Windows PowerShell 5.1 does not escape embedded double quotes when passing arguments to native
# executables, so the JSON passed to session-manager-plugin below is escaped by hand (\"). PowerShell 7.3+
# escapes them itself, which would double-escape. Force the legacy behavior so both work. (No-op on 5.1.)
$PSNativeCommandArgumentPassing = 'Legacy'

function Get-Timestamp {
    return Get-Date -Format 'yyyy/MM/dd HH:mm:ss'
}

function Log {
    param (
        [string] $Message
    )

    $line = "$(Get-Timestamp) $Message"
    if ([string]::IsNullOrEmpty($Env:LOG_FILE_LOCATION)) {
        [Console]::Error.WriteLine($line)
        return
    }
    # UTF-8 without BOM (Out-File -Encoding utf8 writes a BOM on Windows PowerShell 5.1).
    [System.IO.File]::AppendAllText($Env:LOG_FILE_LOCATION, "$line`n")
}

function Require {
    param (
        [string] $Name,
        [switch] $NoLog
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrEmpty($value)) {
        Log "error: missing required arg: $Name"
        exit 1
    }

    if (!$NoLog.IsPresent) {
        Log "$Name=$value"
    }

    return $value
}

function Main {
    Log '=============================================================================='

    $debugLog = Require -Name 'DEBUG_LOG'
    $region = Require -Name 'AWS_REGION'

    $sessionId = Require -Name 'SESSION_ID'
    $streamUrl = Require -Name 'STREAM_URL' -NoLog
    $token = Require -Name 'TOKEN' -NoLog

    # Only log file paths when debug level is enabled.
    $noLogPaths = $debugLog -ne '1'
    $ssmCli = Require -Name 'AWS_SSM_CLI' -NoLog:$noLogPaths
    $null = Require -Name 'LOG_FILE_LOCATION' -NoLog:$noLogPaths

    & $ssmCli "{\`"streamUrl\`":\`"$streamUrl\`",\`"tokenValue\`":\`"$token\`",\`"sessionId\`":\`"$sessionId\`"}" "$region" 'StartSession'
    exit $LASTEXITCODE
}

Main
