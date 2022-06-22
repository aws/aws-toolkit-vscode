# Usage:
#   When connecting to a CAWS workspace
#       $Env:AWS_REGION=… $Env:AWS_SSM_CLI=… $Env:CAWS_ENDPOINT=… $Env:BEARER_TOKEN_LOCATION=… $Env:ORGANIZATION_NAME=… $Env:PROJECT_NAME=… $Env:WORKSPACE_ID=… ./mde_connect.ps1
#   When connecting to an MDE workspace
#       $Env:AWS_REGION=… $Env:AWS_SSM_CLI=… $Env:AWS_MDE_SESSION=… $Env:AWS_MDE_STREAMURL=… $Env:AWS_MDE_TOKEN=… ./mde_connect.ps1

function Get-Timestamp {
    return Get-Date -format "[yyyy-MMM-dd HH:mm:ss]"
}    

function Require {
    param (
        [switch] $Silent,
        [string] $VariableName
    )

    $value = [Environment]::GetEnvironmentVariable($VariableName)

    if ($value -eq $null) {
        Write-Output "error: missing required arg: $VariableName"
        Exit 1
    }

    if (!$Silent.IsPresent) {
        Write-Debug "$(Get-Timestamp) $VariableName=$value"
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

    $startSessionQuery = @"
{
    "id": "$WorkspaceId", 
    "projectName": "$Project", 
    "organizationName": "$Organization", 
    "developmentWorkspaceId": "$WorkspaceId", 
    "sessionConfiguration": { 
        "sessionType": "SSH" 
    }
}
"@

    $webRequest = Invoke-WebRequest -Method 'POST' -Uri $Endpoint -Headers @{"Content-Type" = "application/x-amz-json-1.0"; "Authorization" = "Bearer $Token"; "X-Amz-Target" = "CodeAws.StartSessionDevelopmentWorkspace" } -Body "$startSessionQuery"
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
        Write-Output "Failed to start the session with error: $startSessionResponse"
        Exit 1
    }

    $mdeStreamUrl = $startSessionResponse.accessDetails.streamUrl
    $mdeToken = $startSessionResponse.accessDetails.tokenValue
    $mdeSession = $startSessionResponse.sessionId

    & $SsmPath `
        "{\`"streamUrl\`":\`"$mdeStreamUrl\`",\`"tokenValue\`":\`"$mdeToken\`",\`"sessionId\`":\`"$mdeSession\`"}" `
        "$Region" `
        "StartSession"
}

function ExecMde {
    param (
        [string] $SessionId,  
        [string] $StreamUrl,
        [string] $TokenValue,
        [string] $Region,
        [string] $SsmPath
    )
    
    & $SsmPath `
        "{\`"streamUrl\`":\`"$StreamUrl\`",\`"tokenValue\`":\`"$TokenValue\`",\`"sessionId\`":\`"$SessionId\`"}" `
        "$Region" `
        "StartSession"
}

function Main {
    $region = Require -VariableName "AWS_REGION"
    $ssmPath = Require -VariableName "AWS_SSM_CLI"

    if ($null -ne [Environment]::GetEnvironmentVariable("CAWS_ENDPOINT")) {
        $cawsEndpoint = Require -VariableName "CAWS_ENDPOINT"
        $bearerTokenLocation = Require -VariableName "BEARER_TOKEN_LOCATION"
        $organizationName = Require -VariableName "ORGANIZATION_NAME"
        $projectName = Require -VariableName "PROJECT_NAME"
        $workspaceId = Require -VariableName "WORKSPACE_ID"
        $cachedBearerToken = Get-Content -Path $bearerTokenLocation

        ExecCaws -Endpoint $cawsEndpoint -Token $cachedBearerToken -Organization $organizationName -Project $projectName -WorkspaceId $workspaceId  -Region $region -SsmPath $ssmPath 
    }
    else {
        $sessionId = Require -VariableName "AWS_MDE_SESSION"
        $streamUrl = Require -VariableName "AWS_MDE_STREAMURL" -Silent
        $tokenValue = Require -VariableName "AWS_MDE_TOKEN" -Silent

        ExecMde -SessionId $sessionId -StreamUrl $streamUrl -TokenValue $tokenValue -Region $region -SsmPath $ssmPath
    }
}

Main
