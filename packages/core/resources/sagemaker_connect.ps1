param (
    [Parameter(Mandatory = $true)][string]$Hostname
)

Write-Host "`n--- Script Start ---"
Write-Host "Start Time: $(Get-Date -Format o)"
Write-Host "Hostname argument received: $Hostname"

Set-PSDebug -Trace 1

function Get-SSMSessionInfo {
    param (
        [string]$CredentialsType,
        [string]$AwsResourceArn,
        [int]$LocalEndpointPort
    )

    Write-Host "Calling Get-SSMSessionInfo with credsType=${CredentialsType}, arn=${AwsResourceArn}, port=${LocalEndpointPort}"

    $url = "http://127.0.0.1:$LocalEndpointPort/get_session?connection_identifier=$AwsResourceArn&credentials_type=$CredentialsType"
    Write-Host "Request URL: $url"

    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
        Write-Host "Received response with status: $($response.StatusCode)"

        if ($response.StatusCode -ne 200) {
            Write-Error "Failed to get SSM session info. HTTP status: $($response.StatusCode)"
            Write-Error "Response: $($response.Content)"
            exit 1
        }

        if (-not $response.Content) {
            Write-Error "SSM connection info is empty."
            exit 1
        }

        $script:SSM_SESSION_JSON = $response.Content
        Write-Host "Session JSON successfully retrieved"
    } catch {
        Write-Error "Exception in Get-SSMSessionInfo: $_"
        exit 1
    }
}

function Get-SSMSessionInfoAsync {
    param (
        [string]$CredentialsType,
        [string]$AwsResourceArn,
        [int]$LocalEndpointPort
    )

    $requestId = [string][DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $url = "http://localhost:$LocalEndpointPort/get_session_async?connection_identifier=$AwsResourceArn&credentials_type=$CredentialsType&request_id=$requestId"
    Write-Host "Calling Get-SSMSessionInfoAsync with URL: $url"

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
                Write-Error "Failed to get SSM session info. HTTP status: ${statusCode}"
                Write-Error "Response: $($response.Content)"
                exit 1
            }
        } catch {
            Write-Error "Exception in Get-SSMSessionInfoAsync: $_"
            exit 1
        }
    }

    Write-Error "Timed out after ${maxRetries} attempts waiting for session to be ready."
    exit 1
}

# Parse creds_type and AWS resource ARN from HOSTNAME
Write-Host "`nParsing hostname..."
if ($Hostname -match "^sm[^_]*_([^_]+)_(arn_._aws.*)$") {
    $CREDS_TYPE = $matches[1]
    $AWS_RESOURCE_ARN = $matches[2] -replace '_._', ':' -replace '__', '/'
} else {
    Write-Error "Invalid hostname format. Expected format: sm<optional_sub_type>_<creds-type>_<AWSResourceARN>"
    exit 1
}

$REGION = ($AWS_RESOURCE_ARN -split ':')[3]
Write-Host "Parsed values:"
Write-Host "  CREDS_TYPE: ${CREDS_TYPE}"
Write-Host "  AWS_RESOURCE_ARN: ${AWS_RESOURCE_ARN}"
Write-Host "  REGION: ${REGION}"

# Validate credentials type
if ($CREDS_TYPE -ne "lc" -and $CREDS_TYPE -ne "dl") {
    Write-Error "Invalid creds_type. Must be 'lc' or 'dl'."
    exit 1
}

# Ensure local server is running, restart if dead
Write-Host "`nChecking local server..."
$serverInfoPath = $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH
$serverAlive = $false

if ($serverInfoPath -and (Test-Path $serverInfoPath)) {
    try {
        $jsonContent = Get-Content $serverInfoPath -Raw | ConvertFrom-Json
        $LOCAL_ENDPOINT_PORT = $jsonContent.port
        if ($LOCAL_ENDPOINT_PORT -and $LOCAL_ENDPOINT_PORT -ne "null") {
            $healthCheck = Invoke-WebRequest -Uri "http://127.0.0.1:${LOCAL_ENDPOINT_PORT}/get_session" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            $serverAlive = $true
            Write-Host "Local server is alive on port $LOCAL_ENDPOINT_PORT"
        }
    } catch {
        Write-Host "Local server health check failed: $_"
    }
}

if (-not $serverAlive) {
    $serverJsPath = $env:SAGEMAKER_LOCAL_SERVER_JS_PATH
    if (-not $serverJsPath -or -not (Test-Path $serverJsPath)) {
        Write-Error "Cannot start server: SAGEMAKER_LOCAL_SERVER_JS_PATH is not set or file not found"
        exit 1
    }

    $logDir = Split-Path $serverInfoPath -Parent
    Write-Host "Starting local server..."
    $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH = $serverInfoPath
    Start-Process -NoNewWindow -FilePath "node" -ArgumentList $serverJsPath `
        -RedirectStandardOutput "$logDir\sagemaker-local-server.out.log" `
        -RedirectStandardError "$logDir\sagemaker-local-server.err.log"

    # Wait for info file to be written with a valid port
    for ($i = 1; $i -le 20; $i++) {
        try {
            $jsonContent = Get-Content $serverInfoPath -Raw | ConvertFrom-Json
            $LOCAL_ENDPOINT_PORT = $jsonContent.port
            if ($LOCAL_ENDPOINT_PORT -and $LOCAL_ENDPOINT_PORT -ne "null") {
                Write-Host "Server started on port $LOCAL_ENDPOINT_PORT"
                break
            }
        } catch {}
        Start-Sleep -Milliseconds 500
    }

    if (-not $LOCAL_ENDPOINT_PORT -or $LOCAL_ENDPOINT_PORT -eq "null") {
        Write-Error "Timed out waiting for local server to start"
        exit 1
    }
}

# Retrieve SSM session
Write-Host "`nStarting session retrieval..."
if ($CREDS_TYPE -eq "lc") {
    Get-SSMSessionInfo -CredentialsType "local" -AwsResourceArn $AWS_RESOURCE_ARN -LocalEndpointPort $LOCAL_ENDPOINT_PORT
} elseif ($CREDS_TYPE -eq "dl") {
    Get-SSMSessionInfoAsync -CredentialsType "deeplink" -AwsResourceArn $AWS_RESOURCE_ARN -LocalEndpointPort $LOCAL_ENDPOINT_PORT
}

# Execute the session
Write-Host "`nLaunching session-manager-plugin..."
$sessionPlugin = if ($env:AWS_SSM_CLI) { $env:AWS_SSM_CLI } else { "session-manager-plugin" }

$jsonObj = $script:SSM_SESSION_JSON | ConvertFrom-Json
$streamUrl = $jsonObj.StreamUrl
$tokenValue = $jsonObj.TokenValue
$sessionId = $jsonObj.SessionId

Write-Host "Session Values:"
Write-Host "  Stream URL: ${streamUrl}"
Write-Host "  Token Value: ${tokenValue}"
Write-Host "  Session ID: ${sessionId}"

& $sessionPlugin "{\`"streamUrl\`":\`"${streamUrl}\`",\`"tokenValue\`":\`"${tokenValue}\`",\`"sessionId\`":\`"${sessionId}\`"}" "$REGION" "StartSession"