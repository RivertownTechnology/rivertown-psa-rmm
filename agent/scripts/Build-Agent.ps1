<#
.SYNOPSIS
    Builds all Rivertown RMM Agent components and packages them for distribution.
.DESCRIPTION
    Publishes the Agent Service, Tray App, Updater, and Setup as self-contained win-x64 executables.
    Creates a zip file ready to upload to the API for distribution.
#>
param(
    [string]$Configuration = "Release",
    [string]$OutputDir = "$PSScriptRoot\..\publish"
)

$ErrorActionPreference = "Stop"
$AgentDir = "$PSScriptRoot\.."

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Rivertown RMM Agent Build" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Clean
if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\agent" -Force | Out-Null

# Build Agent Service
Write-Host "`nBuilding Agent Service..." -ForegroundColor Yellow
dotnet publish "$AgentDir\src\Rivertown.Agent.Core\Rivertown.Agent.Core.csproj" `
    -c $Configuration -r win-x64 --self-contained -o "$OutputDir\agent" /p:PublishSingleFile=true

# Build Tray App
Write-Host "`nBuilding Tray App..." -ForegroundColor Yellow
dotnet publish "$AgentDir\src\Rivertown.Agent.Tray\Rivertown.Agent.Tray.csproj" `
    -c $Configuration -r win-x64 --self-contained -o "$OutputDir\agent" /p:PublishSingleFile=true

# Build Updater
Write-Host "`nBuilding Updater..." -ForegroundColor Yellow
dotnet publish "$AgentDir\src\Rivertown.Agent.Updater\Rivertown.Agent.Updater.csproj" `
    -c $Configuration -r win-x64 --self-contained -o "$OutputDir\agent" /p:PublishSingleFile=true

# Copy agent binaries into Setup embed folder (so they get embedded as resources)
Write-Host "`nEmbedding agent binaries into Setup..." -ForegroundColor Yellow
$embedDir = "$AgentDir\src\Rivertown.Agent.Setup\embed"
New-Item -ItemType Directory -Path $embedDir -Force | Out-Null
Copy-Item "$OutputDir\agent\Rivertown.Agent.Core.exe" "$embedDir\" -Force
Copy-Item "$OutputDir\agent\Rivertown.Agent.Tray.exe" "$embedDir\" -Force
Copy-Item "$OutputDir\agent\RivertownUpdater.exe" "$embedDir\" -Force

# Build Setup (with embedded binaries)
Write-Host "`nBuilding Setup (single-file installer with embedded agent)..." -ForegroundColor Yellow
dotnet publish "$AgentDir\src\Rivertown.Agent.Setup\Rivertown.Agent.Setup.csproj" `
    -c $Configuration -r win-x64 --self-contained -o "$OutputDir\setup" /p:PublishSingleFile=true

# Get version from the built assembly
$version = (Get-Item "$OutputDir\agent\Rivertown.Agent.Core.exe").VersionInfo.ProductVersion
if (-not $version) { $version = "0.2.0" }
Write-Host "`nVersion: $version" -ForegroundColor Green

# Copy the single-file installer to the output root
Copy-Item "$OutputDir\setup\RivertownAgentSetup.exe" "$OutputDir\RivertownAgentSetup.exe" -Force

# Also create a distribution zip of just the agent binaries (for the download API)
Write-Host "`nCreating agent distribution zip..." -ForegroundColor Yellow
$zipPath = "$OutputDir\rivertown-agent-$version-win-x64.zip"
Compress-Archive -Path "$OutputDir\agent\*" -DestinationPath $zipPath -Force

# Clean up embed folder
Remove-Item "$embedDir" -Recurse -Force -ErrorAction SilentlyContinue

$setupSize = (Get-Item "$OutputDir\RivertownAgentSetup.exe").Length / 1MB

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output:"
Write-Host "  INSTALLER:  $OutputDir\RivertownAgentSetup.exe ($([math]::Round($setupSize, 1)) MB) - single file, everything embedded"
Write-Host "  Agent zip:  $zipPath (for API distribution)"
Write-Host "  Version:    $version"
Write-Host ""
Write-Host "Usage:"
Write-Host "  RivertownAgentSetup.exe --token ENROLLMENT_KEY"
Write-Host "  Or rename to: RivertownRMM_ENROLLMENTKEY.exe"
Write-Host ""
