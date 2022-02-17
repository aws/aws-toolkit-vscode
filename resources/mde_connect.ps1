# Usage:
#   AWS_REGION=… AWS_MDE_ENDPOINT=… AWS_SSM_CLI=… AWS_MDE_SESSION=… AWS_MDE_STREAMURL=… AWS_MDE_TOKEN=… ./mde_connect.ps1 <env-id>

param (
    [string] $EnvironmentID
)

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

function Main {
    param (
        [string] $EnvironmentID
    )

    $region = Require -VariableName "AWS_REGION"
    $ssmPath = Require -VariableName "AWS_SSM_CLI"
    $sessionId = Require -VariableName "AWS_MDE_SESSION"
    $streamUrl = Require -VariableName "AWS_MDE_STREAMURL" -Silent
    $tokenValue = Require -VariableName "AWS_MDE_TOKEN" -Silent

    & $ssmPath `
        "{\`"streamUrl\`":\`"$streamUrl\`",\`"tokenValue\`":\`"$tokenValue\`",\`"sessionId\`":\`"$sessionId\`"}" `
        "$region" `
        "StartSession"
}

Main -EnvironmentID $EnvironmentID
