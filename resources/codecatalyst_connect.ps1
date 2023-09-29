# Usage:
#   When connecting to a dev environment
#       $Env:AWS_REGION=… $Env:AWS_SSM_CLI=… $Env:CODECATALYST_ENDPOINT=… $Env:BEARER_TOKEN_LOCATION=… $Env:SPACE_NAME=… $Env:PROJECT_NAME=… $Env:DEVENV_ID=… ./code_catalyst_connect.ps1

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

function StartDevEnvironmentSession {
    param (
        [string] $Endpoint,
        [string] $Token,
        [string] $Space,
        [string] $Project,
        [string] $DevEnvId
    )

    $startSessionPath = "/v1/spaces/$Space/projects/$Project/devEnvironments/$DevEnvId/session"
    $startSessionQuery = @"
{
    "sessionConfiguration": { 
        "sessionType": "SSH" 
    }
}
"@

    $webRequest = Invoke-WebRequest -Method 'PUT' -Uri "$Endpoint$startSessionPath" -Headers @{"Content-Type" = "application/json"; "Authorization" = "Bearer $Token" } -Body "$startSessionQuery" -UseBasicParsing
    ConvertFrom-Json -InputObject $webRequest
}

function ExecCodeCatalyst {
    param (
        [string] $Endpoint,
        [string] $Token,
        [string] $Space,
        [string] $Project,
        [string] $DevEnvId,
        [string] $Region,
        [string] $SsmPath
    )

    $startSessionResponse = StartDevEnvironmentSession -Endpoint $Endpoint -Token $Token -Space $Space -Project $Project -DevEnvId $DevEnvId

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

    $codeCatalystEndpoint = Require -VariableName "CODECATALYST_ENDPOINT"
    $bearerTokenLocation = Require -VariableName "BEARER_TOKEN_LOCATION"
    $spaceName = Require -VariableName "SPACE_NAME"
    $projectName = Require -VariableName "PROJECT_NAME"
    $devenvId = Require -VariableName "DEVENV_ID"
    
    $cachedBearerToken = Get-Content -Path $bearerTokenLocation

    ExecCodeCatalyst -Endpoint $codeCatalystEndpoint -Token $cachedBearerToken -Space $spaceName -Project $projectName -DevEnvId $devenvId  -Region $region -SsmPath $ssmPath 
}

Main
