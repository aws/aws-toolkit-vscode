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

# Fetches fresh session credentials from the local detached server.
# Returns a hashtable with StreamUrl, TokenValue, SessionId on success, or $null on failure.
function Try-GetHyperpodSession {
    param([string]$ConnectionKey, [int]$Port)
    
    $url = "http://127.0.0.1:${Port}/get_hyperpod_session?connection_key=${ConnectionKey}"
    $maxRetries = 5
    $retryDelay = 2
    
    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
            $json = $response.Content | ConvertFrom-Json
            
            if ($json.StreamUrl -and $json.TokenValue) {
                return $json
            }
            Write-Log "Error: Failed to parse session response"
            return $null
        } catch {
            $statusCode = 0
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            
            if ($statusCode -eq 429 -or $statusCode -eq 404 -or $statusCode -eq 401 -or $statusCode -eq 422) {
                Write-Log "Server returned ${statusCode}. Please reconnect from the IDE."
                return $null
            }
            
            Write-Log "Server returned ${statusCode}. Retrying in ${retryDelay}s... [$attempt/$maxRetries]"
            Start-Sleep -Seconds $retryDelay
            $retryDelay = $retryDelay * 2
        }
    }
    
    Write-Log "Failed to get session after $maxRetries attempts."
    return $null
}

function Main {
    Write-Log "=============================================================================="
    
    # Parse hostname format: smhp_{workspace}_{namespace}_{cluster_name}_{region}_{account_id}
    if ($HostName -match '^smhp[^_]*_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^_]+)$') {
        $workspaceName = $Matches[1]
        $namespace = $Matches[2]
        $clusterName = $Matches[3]
        $connectionKey = "${workspaceName}:${namespace}:${clusterName}"
    } else {
        # Old format fallback
        $workspaceName = $HostName -replace '^smhp[^_]*_', ''
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
    
    # Try the local server first for fresh credentials. This handles both initial
    # connections and reconnections. Falls back to env vars if the server call fails
    # (e.g. deeplink connections without full EKS metadata in the mapping).
    $gotSession = $false
    $serverInfoPath = $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH
    if ($serverInfoPath -and (Test-Path $serverInfoPath)) {
        try {
            $serverInfo = Get-Content $serverInfoPath | ConvertFrom-Json
            $localPort = $serverInfo.port
            if ($localPort) {
                Write-Log "Fetching session from local server on port $localPort"
                $session = Try-GetHyperpodSession -ConnectionKey $connectionKey -Port $localPort
                if ($session) {
                    $streamUrl = $session.StreamUrl
                    $token = $session.TokenValue
                    $sessionId = $session.SessionId
                    $gotSession = $true
                    Write-Log "Got fresh session credentials from local server"
                } else {
                    Write-Log "Local server call failed. Falling back to environment variables."
                }
            }
        } catch {
            Write-Log "Error reading server info: $_. Falling back to environment variables."
        }
    }

    if (-not $gotSession) {
        if ($env:STREAM_URL -and $env:TOKEN) {
            Write-Log "Using credentials from environment variables"
            $streamUrl = $env:STREAM_URL
            $token = $env:TOKEN
            $sessionId = if ($env:SESSION_ID) { $env:SESSION_ID } else { $HostName }
        } else {
            Write-Log "Error: No session credentials available. Please reconnect from the IDE."
            Write-Error "No session credentials available. Please reconnect from the IDE."
            exit 1
        }
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