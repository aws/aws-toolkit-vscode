#Requires -Version 5.1

# Usage:
#   When connecting to a dev environment
#   $env:AWS_REGION="…"; $env:AWS_SSM_CLI="…"; $env:STREAM_URL="…"; $env:TOKEN="…"; $env:LOG_FILE_LOCATION="…"; $env:DEBUG_LOG="…"; .\ec2_connect.ps1

# Exit on errors
$ErrorActionPreference = "Stop"

# Date command equivalent
function Get-DateString {
    return Get-Date -Format "yyyy/MM/dd HH:mm:ss"
}

function Write-Log {
    param (
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    "$(Get-DateString) $Message" | Out-File -FilePath $env:LOG_FILE_LOCATION -Append
}

function Test-RequiredNoLog {
    param (
        [string]$Name,
        [string]$Value
    )
    if ([string]::IsNullOrEmpty($Name) -or [string]::IsNullOrEmpty($Value)) {
        Write-Log "error: missing required arg: $Name"
        exit 1
    }
}

function Test-Required {
    param (
        [string]$Name,
        [string]$Value
    )
    Test-RequiredNoLog -Name $Name -Value $Value
    Write-Log "$Name=$Value"
}

function Start-EC2Session {
    param (
        [string]$AWSSSMCLI,
        [string]$AWSRegion,
        [string]$StreamURL,
        [string]$Token,
        [string]$SessionID
    )

    $jsonPayload = @{
        streamUrl = $StreamURL
        tokenValue = $Token
        sessionId = $Token
    } | ConvertTo-Json -Compress
    
    # Execute the SSM CLI command
    & $AWSSSMCLI $jsonPayload $AWSRegion "StartSession"
}

function Main {
    Write-Log "=============================================================================="

    Test-Required -Name "DEBUG_LOG" -Value $env:DEBUG_LOG
    Test-Required -Name "AWS_REGION" -Value $env:AWS_REGION
    
    Test-Required -Name "SESSION_ID" -Value $env:SESSION_ID
    Test-RequiredNoLog -Name "STREAM_URL" -Value $env:STREAM_URL
    Test-RequiredNoLog -Name "TOKEN" -Value $env:TOKEN

    # Only log file paths when debug level is enabled
    if ([int]$env:DEBUG_LOG -eq 1) {
        Test-Required -Name "AWS_SSM_CLI" -Value $env:AWS_SSM_CLI
        Test-Required -Name "LOG_FILE_LOCATION" -Value $env:LOG_FILE_LOCATION
    }
    else {
        Test-RequiredNoLog -Name "AWS_SSM_CLI" -Value $env:AWS_SSM_CLI
        Test-RequiredNoLog -Name "LOG_FILE_LOCATION" -Value $env:LOG_FILE_LOCATION
    }

    Start-EC2Session -AWSSSMCLI $env:AWS_SSM_CLI `
                    -AWSRegion $env:AWS_REGION `
                    -StreamURL $env:STREAM_URL `
                    -Token $env:TOKEN `
                    -SessionID $env:SESSION_ID
}

# Execute main function
Main