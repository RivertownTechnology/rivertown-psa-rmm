<#
Creates one tenant-scoped Connect credential through the deployed PSA API.
Run after applying amazon-connect-pgadmin.sql and deploying the updated API.
The access token is a current owner/admin PSA JWT, NOT an AWS credential.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][guid]$AppleBusinessId,
    [Parameter(Mandatory = $true)][string]$InstanceArn,
    [string]$Name = 'Amazon Connect production',
    [string]$ApiBaseUrl = 'https://psa.rivertowntechnology.com/api/v1'
)

$ErrorActionPreference = 'Stop'
if (-not $ApiBaseUrl.StartsWith('https://')) { throw 'Use an HTTPS API base URL.' }
if ($InstanceArn -notmatch '^arn:aws:connect:[a-z0-9-]+:\d{12}:instance/[0-9a-f-]{36}$') {
    throw 'Supply the Connect instance ARN, not the instance URL.'
}
$secureAccessToken = Read-Host 'Paste your current PSA owner/admin access token (hidden)' -AsSecureString
$accessToken = [System.Net.NetworkCredential]::new('', $secureAccessToken).Password
try {
    $body = @{
        name = $Name
        appleBusinessId = $AppleBusinessId.ToString()
        instanceArn = $InstanceArn
    } | ConvertTo-Json
    $result = Invoke-RestMethod -Method Post -Uri "$($ApiBaseUrl.TrimEnd('/'))/integrations/amazon-connect/credentials" `
        -Headers @{ Authorization = "Bearer $accessToken" } -ContentType 'application/json' -Body $body
    Write-Host "Credential ID: $($result.id)"
    Write-Host 'Save the token below as apiToken in AWS Secrets Manager. It cannot be retrieved from the PSA later.'
    Write-Host $result.token
    Write-Host 'To rotate: create a replacement, update Secrets Manager, test, then revoke the previous credential ID.'
} catch {
    $response = $_.Exception.Response
    if ($response -and [int]$response.StatusCode -eq 404) {
        throw 'The API returned 404. Deploy the Amazon Connect endpoint changes from C:\NewGit\rivertown-psa-rmm, wait for the API container to update, then retry. Updating the database alone does not add API routes.'
    }
    throw
} finally {
    $accessToken = $null
    $secureAccessToken = $null
    $result = $null
}
