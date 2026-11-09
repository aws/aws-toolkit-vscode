param (
    [Parameter(Mandatory=$true)][string]$HostName
)

Write-Host "`n--- Script Start ---"
Write-Host "Start Time: $(Get-Date -Format o)"
Write-Host "Hostname argument received: $HostName"

function Get-HyperpodSession {
    param (
        [string]$ConnectionKey,
        [int]$LocalEndpointPort
    )

    Write-Host "Calling Get-HyperpodSession with connectionKey=${ConnectionKey}, port=${LocalEndpointPort}"

    $url = "http://localhost:${LocalEndpointPort}/get_hyperpod_session?connection_key=${ConnectionKey}"
    Write-Host "Request URL: $url"

    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
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

function Get-HyperpodSessionAsync {
    param (
        [string]$ConnectionKey,
        [int]$LocalEndpointPort
    )

    $requestId = [string][DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $url = "http://localhost:${LocalEndpointPort}/get_hyperpod_session_async?connection_key=${ConnectionKey}&request_id=$requestId"
    Write-Host "Calling Get-HyperpodSessionAsync with URL: $url"

    $maxRetries = 8
    $retryInterval = 5

    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
            $statusCode = $response.StatusCode
            Write-Host "Attempt ${attempt}: HTTP ${statusCode}"

            if ($statusCode -eq 200) {
                $script:SSM_SESSION_JSON = $response.Content
                Write-Host "Session JSON successfully retrieved"
                return
            } elseif ($statusCode -eq 202 -or $statusCode -eq 204) {
                Write-Host "Session not ready. Retrying in ${retryInterval} seconds... [${attempt}/${maxRetries}]"
                Start-Sleep -Seconds $retryInterval
            } else {
                Write-Error "Failed to get HyperPod session info. HTTP status: ${statusCode}"
                Write-Error "Response: $($response.Content)"
                exit 1
            }
        } catch {
            Write-Error "Exception in Get-HyperpodSessionAsync: $_"
            exit 1
        }
    }

    Write-Error "Timed out after ${maxRetries} attempts waiting for session to be ready."
    exit 1
}

# Parse hostname format: smhp_<dl|lc>_<workspace>_<namespace>_<cluster>_<region>_<account>
Write-Host "`nParsing hostname..."
if ($HostName -match '^smhp[^_]*_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^_]+)$') {
    $CREDS_TYPE = $Matches[1]
    $workspaceName = $Matches[2]
    $namespace = $Matches[3]
    $clusterName = $Matches[4]
    $CONNECTION_KEY = "${workspaceName}:${namespace}:${clusterName}"
} else {
    Write-Error "Invalid hostname format. Expected format: smhp<optional>_<dl|lc>_<workspace>_<namespace>_<cluster>_<region>_<account>"
    exit 1
}

if (-not $CONNECTION_KEY) {
    Write-Error "Could not determine connection key for workspace: $workspaceName"
    exit 1
}

Write-Host "Parsed values:"
Write-Host "  CREDS_TYPE: ${CREDS_TYPE}"
Write-Host "  Workspace: ${workspaceName}"
Write-Host "  Connection Key: ${CONNECTION_KEY}"

if ($CREDS_TYPE -ne "lc" -and $CREDS_TYPE -ne "dl") {
    Write-Error "Invalid creds_type. Must be 'lc' or 'dl'."
    exit 1
}

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
if ($CREDS_TYPE -eq "lc") {
    Get-HyperpodSession -ConnectionKey $CONNECTION_KEY -LocalEndpointPort $LOCAL_ENDPOINT_PORT
} elseif ($CREDS_TYPE -eq "dl") {
    Get-HyperpodSessionAsync -ConnectionKey $CONNECTION_KEY -LocalEndpointPort $LOCAL_ENDPOINT_PORT
}

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