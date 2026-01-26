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

function Get-FreshCredentials {
    param([string]$ConnectionKey)
    
    Write-Log "Getting fresh credentials for connection key: $ConnectionKey"
    
    # Read server info to get port
    $serverInfoFile = "$env:APPDATA\Code\User\globalStorage\amazonwebservices.aws-toolkit-vscode\sagemaker-local-server-info.json"
    if (-not (Test-Path $serverInfoFile)) {
        Write-Log "Error: Server info file not found: $serverInfoFile"
        exit 1
    }
    
    $serverInfo = Get-Content $serverInfoFile | ConvertFrom-Json
    $port = $serverInfo.port
    
    if (-not $port) {
        Write-Log "Error: Could not extract port from server info file"
        exit 1
    }
    
    # Call API to get fresh credentials
    $apiUrl = "http://localhost:$port/get_hyperpod_session?connection_key=$ConnectionKey"
    
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Method Get
        Write-Log "Fresh credentials obtained from API"
        return $response
    } catch {
        Write-Log "Error: Failed to get credentials from API: $_"
        exit 1
    }
}

function Main {
    Write-Log "=============================================================================="
    
    # Parse hostname format: hp_{cluster_name}_{namespace}_{space_name}_{region}_{account_id}
    if ($HostName -match '^hp_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^_]+)$') {
        $clusterName = $Matches[1]
        $namespace = $Matches[2]
        $devspaceName = $Matches[3]
        $connectionKey = "${clusterName}:${namespace}:${devspaceName}"
    } else {
        # Old format fallback
        $devspaceName = $HostName -replace '^hp_', ''
        $profilesFile = "$env:USERPROFILE\.aws\.hyperpod-space-profiles"
        
        if (Test-Path $profilesFile) {
            $profiles = Get-Content $profilesFile | ConvertFrom-Json
            $matches = $profiles.PSObject.Properties.Name | Where-Object { $_ -match ":$devspaceName$" } | Sort-Object
            $connectionKey = if ($matches) { $matches[0] } else { $devspaceName }
        } else {
            $connectionKey = $devspaceName
        }
    }
    
    if (-not $connectionKey) {
        Write-Log "Error: Could not determine connection key for devspace: $devspaceName"
        exit 1
    }
    
    Write-Log "Connecting to HyperPod devspace: $devspaceName (connection key: $connectionKey)"
    
    # Get fresh credentials
    $apiResponse = Get-FreshCredentials -ConnectionKey $connectionKey
    
    # Parse connection URL
    $connectionUrl = [System.Web.HttpUtility]::HtmlDecode($apiResponse.connection.url)
    $uri = [System.Uri]$connectionUrl
    $queryParams = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
    
    $sessionId = $queryParams['sessionId']
    $token = $queryParams['sessionToken'] -replace ' ', '+'
    $streamUrl = [System.Web.HttpUtility]::UrlDecode($queryParams['streamUrl']) -replace ' ', '+'
    
    # Add cell-number if present (and fix spaces)
    $cellNumber = $queryParams['cell-number']
    if ($cellNumber) {
        $cellNumberDecoded = [System.Web.HttpUtility]::UrlDecode($cellNumber) -replace ' ', '+'
        $streamUrl += "&cell-number=$cellNumberDecoded"
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
    
    # Execute session-manager-plugin with proper JSON escaping (same as Studio script)
    & $awsSsmCli "{\`"streamUrl\`":\`"${streamUrl}\`",\`"tokenValue\`":\`"${token}\`",\`"sessionId\`":\`"${sessionId}\`"}" "$awsRegion" "StartSession"
}

# Load required assembly for URL decoding
Add-Type -AssemblyName System.Web

Main
