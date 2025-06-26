param (
    [Parameter(Mandatory=$true)][string]$Hostname,
)

Set-PSDebug -Trace 1
function Get-SSMSessionInfo {
    param (
        [string]$CredentialsType,
        [string]$AwsResourceArn,
        [int]$LocalEndpointPort
    )

    $url = "http://127.0.0.1:$LocalEndpointPort/get_session?connection_identifier=$AwsResourceArn&credentials_type=$CredentialsType"

    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -ne 200) {
            Write-Error "Error: Failed to get SSM session info. HTTP status: $($response.StatusCode)"
            Write-Error "Response: $($response.Content)"
            exit 1
        }
        if (-not $response.Content) {
            Write-Error "Error: SSM connection info is empty."
            exit 1
        }
        $script:SSM_SESSION_JSON = $response.Content
    } catch {
        Write-Error "Exception: $_"
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

    $maxRetries = 60
    $retryInterval = 5

    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
            $statusCode = $response.StatusCode
            if ($statusCode -eq 200) {
                $script:SSM_SESSION_JSON = $response.Content
                return
            } elseif ($statusCode -eq 202 -or $statusCode -eq 204) {
                Write-Host "Info: Session not ready (HTTP $statusCode). Retrying in $retryInterval seconds... [$attempt/$maxRetries]"
                Start-Sleep -Seconds $retryInterval
            } else {
                Write-Error "Error: Failed to get SSM session info. HTTP status: $statusCode"
                Write-Error "Response: $($response.Content)"
                exit 1
            }
        } catch {
            Write-Error "Exception: $_"
            exit 1
        }
    }

    Write-Error "Error: Timed out after $maxRetries attempts waiting for session to be ready."
    exit 1
}

Write-Host "HOSTName: $Hostname"

# Parse creds_type and AWS resource ARN from HOSTNAME
if ($Hostname -match "^sm_([^_]+)_(arn_._aws.*)$") {
    $CREDS_TYPE = $matches[1]
    $AWS_RESOURCE_ARN = $matches[2] -replace '_._', ':' -replace '__', '/'
} else {
    Write-Error "Invalid hostname format. Expected format: sm_<creds-type>_<AWSResourceARN> with ':' replaced by '--' and '/' replaced by '__'"
    exit 1
}

$REGION = ($AWS_RESOURCE_ARN -split ':')[3]
Write-Host "Extracted CREDS_TYPE: $CREDS_TYPE"
Write-Host "Extracted AWS_RESOURCE_ARN: $AWS_RESOURCE_ARN"
Write-Host "REGION: $REGION"

# Validate credentials type
if ($CREDS_TYPE -ne "lc" -and $CREDS_TYPE -ne "dl") {
    Write-Error "Invalid creds_type. Must be 'lc' or 'dl'."
    exit 1
}

try {
    $jsonContent = Get-Content $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH -Raw | ConvertFrom-Json
    $LOCAL_ENDPOINT_PORT = $jsonContent.port
} catch {
    Write-Error "[Error] Failed to read or parse JSON file at $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH"
    exit 1
}

if (-not $LOCAL_ENDPOINT_PORT -or $LOCAL_ENDPOINT_PORT -eq "null") {
    Write-Error "[Error] 'port' field is missing or invalid in $env:SAGEMAKER_LOCAL_SERVER_FILE_PATH"
    exit 1
}


# Retrieve SSM session
if ($CREDS_TYPE -eq "lc") {
    Get-SSMSessionInfo -CredentialsType "local" -AwsResourceArn $AWS_RESOURCE_ARN -LocalEndpointPort $LOCAL_ENDPOINT_PORT
} elseif ($CREDS_TYPE -eq "dl") {
    Get-SSMSessionInfoAsync -CredentialsType "deeplink" -AwsResourceArn $AWS_RESOURCE_ARN -LocalEndpointPort $LOCAL_ENDPOINT_PORT
}

# Execute the session
$sessionPlugin = if ($env:AWS_SSM_CLI) { $env:AWS_SSM_CLI } else { "session-manager-plugin" }


$jsonObj = $script:SSM_SESSION_JSON | ConvertFrom-Json

$streamUrl = $jsonObj.StreamUrl
$tokenValue = $jsonObj.TokenValue
$sessionId = $jsonObj.SessionId

Write-Host "Stream URL: $streamUrl"
Write-Host "Token Value: $tokenValue"
Write-Host "Session ID: $sessionId"

& $sessionPlugin "{\`"streamUrl\`":\`"$streamUrl\`",\`"tokenValue\`":\`"$tokenValue\`",\`"sessionId\`":\`"$sessionId\`"}" "$Region" "StartSession"
