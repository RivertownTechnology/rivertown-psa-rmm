$ErrorActionPreference = 'Stop'
$output = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $output | Out-Null
Compress-Archive -LiteralPath (Join-Path $PSScriptRoot 'index.mjs'), (Join-Path $PSScriptRoot 'bridge.mjs') `
    -DestinationPath (Join-Path $output 'rivertown-connect-bridge.zip') -Force
Write-Output (Join-Path $output 'rivertown-connect-bridge.zip')
