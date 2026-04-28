param (
    [Parameter(Mandatory=$true)][string]$HostName
)

Write-Host "`n--- Script Start ---"
Write-Host "Start Time: $(Get-Date -Format o)"
Write-Host "Hostname argument received: $HostName"

Set-PSDebug -Trace 1

function Get-HyperpodSession {
    param (
        [string]$ConnectionKey,
        [int]$LocalEndpointPort
    )

    Write-Host "Calling Get-HyperpodSession with connectionKey=${ConnectionKey}, port=${LocalEndpointPort}"

    $url = "http://localhost:${LocalEndpointPort}/get_hyperpod_session?connection_key=${ConnectionKey}"
    Write-Host "Request URL: $url"

    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        Write-Host "Received response with status: $($response.StatusCode)"

        if ($response.StatusCode -ne 200) {
            Write-Error "Failed to get HyperPod session info. HTTP status: $($response.StatusCode)"
            Write-Error "Response: $($response.Content)"
            exit 1
        }

        if (-not $response.Content) {
            Write-Error "HyperPod session info is empty."
            exit 1
        }

        $script:SSM_SESSION_JSON = $response.Content
        Write-Host "Session JSON successfully retrieved"
    } catch {
        Write-Error "Exception in Get-HyperpodSession: $_"
        exit 1
    }
}

# Parse hostname format: smhp_{workspace}_{namespace}_{cluster_name}_{region}_{account_id}
Write-Host "`nParsing hostname..."
if ($HostName -match '^smhp[^_]*_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^_]+)$') {
    $workspaceName = $Matches[1]
    $namespace = $Matches[2]
    $clusterName = $Matches[3]
    $CONNECTION_KEY = "${workspaceName}:${namespace}:${clusterName}"
} else {
    # Old format fallback
    $workspaceName = $HostName -replace '^smhp[^_]*_', ''
    $profilesFile = "$env:USERPROFILE\.aws\.hyperpod-space-profiles"

    if (Test-Path $profilesFile) {
        $profiles = Get-Content $profilesFile | ConvertFrom-Json
        $matchedKeys = $profiles.PSObject.Properties.Name | Where-Object { $_ -match ":$workspaceName$" } | Sort-Object
        $CONNECTION_KEY = if ($matchedKeys) { $matchedKeys[0] } else { $workspaceName }
    } else {
        $CONNECTION_KEY = $workspaceName
    }
}

if (-not $CONNECTION_KEY) {
    Write-Error "Could not determine connection key for workspace: $workspaceName"
    exit 1
}

Write-Host "Parsed values:"
Write-Host "  Workspace: ${workspaceName}"
Write-Host "  Connection Key: ${CONNECTION_KEY}"

# Read port from local info JSON
Write-Host "`nReading SAGEMAKER_LOCAL_SERVER_FILE_PATH: $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH"
try {
    $jsonContent = Get-Content $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH -Raw | ConvertFrom-Json
    $LOCAL_ENDPOINT_PORT = $jsonContent.port
    Write-Host "Extracted port: $LOCAL_ENDPOINT_PORT"
} catch {
    Write-Error "Failed to read or parse JSON file at $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH"
    exit 1
}

if (-not $LOCAL_ENDPOINT_PORT -or $LOCAL_ENDPOINT_PORT -eq "null") {
    Write-Error "'port' field is missing or invalid in $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH"
    exit 1
}

# Retrieve HyperPod session
Write-Host "`nStarting session retrieval..."
Get-HyperpodSession -ConnectionKey $CONNECTION_KEY -LocalEndpointPort $LOCAL_ENDPOINT_PORT

# Execute the session
Write-Host "`nLaunching session-manager-plugin..."
$sessionPlugin = if ($env:AWS_SSM_CLI) { $env:AWS_SSM_CLI } else { "session-manager-plugin" }

$jsonObj = $script:SSM_SESSION_JSON | ConvertFrom-Json
$streamUrl = $jsonObj.StreamUrl
$tokenValue = $jsonObj.TokenValue
$sessionId = $jsonObj.SessionId

# Extract region from stream URL
if ($streamUrl -match '\.([a-z0-9-]+)\.amazonaws\.com') {
    $REGION = $Matches[1]
} else {
    Write-Error "Could not extract region from stream URL"
    exit 1
}

Write-Host "Session Values:"
Write-Host "  Stream URL: ${streamUrl}"
Write-Host "  Token Value: ${tokenValue}"
Write-Host "  Session ID: ${sessionId}"
Write-Host "  Region: ${REGION}"

& $sessionPlugin "{\`"streamUrl\`":\`"${streamUrl}\`",\`"tokenValue\`":\`"${tokenValue}\`",\`"sessionId\`":\`"${sessionId}\`"}" "$REGION" "StartSession"
