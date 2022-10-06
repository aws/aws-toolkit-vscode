# Usage:
#   When connecting to a CAWS workspace
#       $Env:AWS_REGION=… $Env:AWS_SSM_CLI=… $Env:CAWS_ENDPOINT=… $Env:BEARER_TOKEN_LOCATION=… $Env:ORGANIZATION_NAME=… $Env:PROJECT_NAME=… $Env:WORKSPACE_ID=… ./caws_connect.ps1

function Get-Timestamp {
    return Get-Date -format "[yyyy-MMM-dd HH:mm:ss]"
}

function Log {
    param (
        [string] $Output,
        [switch] $Debug
    )

    if (!(Test-Path variable:global:logFileLocation)) {
        Write-Output "error: logFileLocation is not defined"
        Exit 1
    }

    if (!(Test-Path $global:logFileLocation)) {
        New-Item -path $global:logFileLocation -type "file" -value ""
    }

    $Output | Out-File -FilePath $global:logFileLocation -Append
    if ($Debug.IsPresent) {
        Write-Debug $Output
    }
    else {
        Write-Output $Output
    }   
}

function Require {
    param (
        [switch] $Silent,
        [string] $VariableName
    )

    $value = [Environment]::GetEnvironmentVariable($VariableName)

    if ($value -eq $null) {
        Log -Output "error: missing required arg: $VariableName"
        Exit 1
    }

    if (!$Silent.IsPresent) {
        Log -Output "$(Get-Timestamp) $VariableName=$value" -Debug
    }

    return $value
}

function StartSessionDevelopmentWorkspace {
    param (
        [string] $Endpoint,
        [string] $Token,
        [string] $Organization,
        [string] $Project,
        [string] $WorkspaceId
    )

    $startSessionPath = "/v1/organizations/$Organization/projects/$Project/developmentWorkspaces/$WorkspaceId/session"
    $startSessionQuery = @"
{
    "sessionConfiguration": { 
        "sessionType": "SSH" 
    }
}
"@

    $webRequest = Invoke-WebRequest -Method 'POST' -Uri "$Endpoint$startSessionPath" -Headers @{"Content-Type" = "application/json"; "Authorization" = "Bearer $Token" } -Body "$startSessionQuery"
    ConvertFrom-Json -InputObject $webRequest
}

function ExecCaws {
    param (
        [string] $Endpoint,
        [string] $Token,
        [string] $Organization,
        [string] $Project,
        [string] $WorkspaceId,
        [string] $Region,
        [string] $SsmPath
    )

    $startSessionResponse = StartSessionDevelopmentWorkspace -Endpoint $Endpoint -Token $Token -Organization $Organization -Project $Project -WorkspaceId $WorkspaceId

    if ($startSessionResponse -match ".*errors.*" -or $startSessionResponse -match ".*ValidationException.*") {
        Log -Output "Failed to start the session with error: $startSessionResponse"
        Exit 1
    }

    $streamUrl = $startSessionResponse.accessDetails.streamUrl
    $tokenValue = $startSessionResponse.accessDetails.tokenValue
    $sessionId = $startSessionResponse.sessionId

    & $SsmPath `
        "{\`"streamUrl\`":\`"$streamUrl\`",\`"tokenValue\`":\`"$tokenValue\`",\`"sessionId\`":\`"$sessionId\`"}" `
        "$Region" `
        "StartSession"
}


function Main {
    $global:logFileLocation = [Environment]::GetEnvironmentVariable("LOG_FILE_LOCATION")

    Log -Output "===================================================================="
    
    $region = Require -VariableName "AWS_REGION"
    $ssmPath = Require -VariableName "AWS_SSM_CLI"

    $cawsEndpoint = Require -VariableName "CAWS_ENDPOINT"
    $bearerTokenLocation = Require -VariableName "BEARER_TOKEN_LOCATION"
    $organizationName = Require -VariableName "ORGANIZATION_NAME"
    $projectName = Require -VariableName "PROJECT_NAME"
    $workspaceId = Require -VariableName "WORKSPACE_ID"
    
    $cachedBearerToken = Get-Content -Path $bearerTokenLocation

    ExecCaws -Endpoint $cawsEndpoint -Token $cachedBearerToken -Organization $organizationName -Project $projectName -WorkspaceId $workspaceId  -Region $region -SsmPath $ssmPath 
}

Main
