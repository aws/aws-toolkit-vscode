# HyperPod Connection Script (PowerShell)
# 
# This script establishes a connection to an AWS SageMaker HyperPod instance using AWS Systems Manager (SSM).

param(
    [Parameter(Mandatory=$true)]
    [string]$HostName
)

$ErrorActionPreference = "Stop"

$DebugLog = $env:DEBUG_LOG -eq "1"
$LogFileLocation = if ($env:LOG_FILE_LOCATION) { $env:LOG_FILE_LOCATION } else { "$env:TEMP\hyperpod_connect.log" }

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy/MM/dd HH:mm:ss"
    "$timestamp $Message" | Out-File -FilePath $LogFileLocation -Append -Encoding utf8
}

function Main {
    Write-Log "=============================================================================="
    
    # Parse hostname format: smhp_{workspace}_{namespace}_{cluster_name}_{region}_{account_id}
    if ($HostName -match '^smhp_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^_]+)$') {
        $workspaceName = $Matches[1]
        $namespace = $Matches[2]
        $clusterName = $Matches[3]
        $connectionKey = "${workspaceName}:${namespace}:${clusterName}"
    } else {
        # Old format fallback
        $workspaceName = $HostName -replace '^smhp_', ''
        $profilesFile = "$env:USERPROFILE\.aws\.hyperpod-space-profiles"
        
        if (Test-Path $profilesFile) {
            $profiles = Get-Content $profilesFile | ConvertFrom-Json
            $matches = $profiles.PSObject.Properties.Name | Where-Object { $_ -match ":$workspaceName$" } | Sort-Object
            $connectionKey = if ($matches) { $matches[0] } else { $workspaceName }
        } else {
            $connectionKey = $workspaceName
        }
    }
    
    if (-not $connectionKey) {
        Write-Log "Error: Could not determine connection key for workspace: $workspaceName"
        exit 1
    }
    
    Write-Log "Connecting to HyperPod workspace: $workspaceName (connection key: $connectionKey)"
    
    # Use env vars directly for initial connection (deeplink), reconnection via API is disabled
    if ($env:STREAM_URL -and $env:TOKEN) {
        Write-Log "Using credentials from environment variables (initial connection)"
        $streamUrl = $env:STREAM_URL
        $token = $env:TOKEN
        $sessionId = if ($env:SESSION_ID) { $env:SESSION_ID } else { $HostName }
    } else {
        Write-Log "No env credentials available. Reconnection via get_hyperpod_session is disabled. Please reconnect from the IDE."
        Write-Error "No env credentials available. Please reconnect from the IDE."
        exit 1
    }
    
    # Extract region from stream URL
    if ($streamUrl -match '\.([a-z0-9-]+)\.amazonaws\.com') {
        $awsRegion = $Matches[1]
    } else {
        Write-Log "Error: Could not extract region from stream URL"
        exit 1
    }
    
    # Find session-manager-plugin
    $awsSsmCli = $env:AWS_SSM_CLI
    if (-not $awsSsmCli) {
        # Try bundled version first
        $bundledPath = "$env:APPDATA\Code\User\globalStorage\amazonwebservices.aws-toolkit-vscode\tools\Amazon\sessionmanagerplugin\bin\session-manager-plugin.exe"
        if (Test-Path $bundledPath) {
            $awsSsmCli = $bundledPath
        } else {
            # Fallback to PATH
            $awsSsmCli = "session-manager-plugin"
        }
    }
    
    Write-Log "AWS_REGION=$awsRegion"
    Write-Log "AWS_SSM_CLI=$awsSsmCli"
    Write-Log "SESSION_ID=$sessionId"
    
    # Pass JSON via environment variable to avoid Windows command-line quoting issues.
    # session-manager-plugin reads from env var when args[1] starts with "AWS_SSM_START_SESSION_RESPONSE".
    $jsonObj = @{ streamUrl = $streamUrl; tokenValue = $token; sessionId = $sessionId }
    $jsonStr = $jsonObj | ConvertTo-Json -Compress
    $envVarName = "AWS_SSM_START_SESSION_RESPONSE"
    $env:AWS_SSM_START_SESSION_RESPONSE = $jsonStr
    & $awsSsmCli $envVarName "$awsRegion" "StartSession"
}

Main