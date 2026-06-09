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

# Resolve SAGEMAKER_LOCAL_SERVER_FILE_PATH if not set (e.g., during window restore)
if (-not $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH = Join-Path $scriptDir "sagemaker-local-server-info.json"
    Write-Host "Derived SAGEMAKER_LOCAL_SERVER_FILE_PATH: $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH"
}

# Resolve server paths from info file if available
if (Test-Path $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH) {
    try {
        $jsonContent = Get-Content $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH -Raw | ConvertFrom-Json
        if (-not $env:SAGEMAKER_SERVER_SCRIPT_PATH -and $jsonContent.serverScriptPath) {
            $env:SAGEMAKER_SERVER_SCRIPT_PATH = $jsonContent.serverScriptPath
        }
        if (-not $env:SAGEMAKER_NODE_PATH -and $jsonContent.nodePath) {
            $env:SAGEMAKER_NODE_PATH = $jsonContent.nodePath
        }
    } catch {
        # Info file may be stale or corrupted, continue anyway
    }
}

# Ensure detached server is running
function Ensure-ServerRunning {
    if ((Test-Path $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH)) {
        try {
            $info = Get-Content $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH -Raw | ConvertFrom-Json
            if ($info.pid) {
                $proc = Get-Process -Id $info.pid -ErrorAction Stop
                if ($proc) {
                    Write-Host "Detached server is running (pid: $($info.pid))"
                    return $true
                }
            }
        } catch {
            # Process not running
        }
    }

    # Server not running - attempt to start it
    if (-not $env:SAGEMAKER_SERVER_SCRIPT_PATH -or -not $env:SAGEMAKER_NODE_PATH) {
        Write-Error "Server is not running and cannot be started (missing SAGEMAKER_SERVER_SCRIPT_PATH or SAGEMAKER_NODE_PATH)"
        return $false
    }

    if (-not (Test-Path $env:SAGEMAKER_SERVER_SCRIPT_PATH)) {
        Write-Error "Server script not found: $env:SAGEMAKER_SERVER_SCRIPT_PATH"
        return $false
    }

    Write-Host "Detached server not running. Starting..."
    Start-Process -FilePath $env:SAGEMAKER_NODE_PATH -ArgumentList "`"$($env:SAGEMAKER_SERVER_SCRIPT_PATH)`"" -WindowStyle Hidden

    # Wait for the info file to appear (max 10 seconds)
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH) {
            try {
                $newJson = Get-Content $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH -Raw | ConvertFrom-Json
                if ($newJson.pid) {
                    $newProc = Get-Process -Id $newJson.pid -ErrorAction Stop
                    if ($newProc) {
                        Write-Host "Detached server started (pid: $($newJson.pid))"
                        return $true
                    }
                }
            } catch {
                # Not ready yet
            }
        }
    }

    Write-Error "Timed out waiting for detached server to start"
    return $false
}

if (-not (Ensure-ServerRunning)) {
    exit 1
}

# Read port from info file (after server is confirmed running)
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

# Retrieve SSM session
Write-Host "`nStarting session retrieval..."
if ($CREDS_TYPE -eq "lc") {
    Get-SSMSessionInfo -CredentialsType "local" -AwsResourceArn $AWS_RESOURCE_ARN -LocalEndpointPort $LOCAL_ENDPOINT_PORT
} elseif ($CREDS_TYPE -eq "dl") {
    Get-SSMSessionInfoAsync -CredentialsType "deeplink" -AwsResourceArn $AWS_RESOURCE_ARN -LocalEndpointPort $LOCAL_ENDPOINT_PORT
}

# Resolve AWS_SSM_CLI if not set (e.g., during window restore)
if (-not $env:AWS_SSM_CLI) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $localSsm = Join-Path $scriptDir "tools\Amazon\sessionmanagerplugin\bin\session-manager-plugin.exe"
    if (Test-Path $localSsm) {
        $env:AWS_SSM_CLI = $localSsm
    }
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