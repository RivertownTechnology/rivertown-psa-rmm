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

# Build Setup
Write-Host "`nBuilding Setup..." -ForegroundColor Yellow
dotnet publish "$AgentDir\src\Rivertown.Agent.Setup\Rivertown.Agent.Setup.csproj" `
    -c $Configuration -r win-x64 --self-contained -o "$OutputDir\setup" /p:PublishSingleFile=true

# Get version from the built assembly
$version = (Get-Item "$OutputDir\agent\Rivertown.Agent.Core.exe").VersionInfo.ProductVersion
if (-not $version) { $version = "0.2.0" }
Write-Host "`nVersion: $version" -ForegroundColor Green

# Create agent distribution zip
Write-Host "`nCreating distribution zip..." -ForegroundColor Yellow
$zipPath = "$OutputDir\rivertown-agent-$version-win-x64.zip"
Compress-Archive -Path "$OutputDir\agent\*" -DestinationPath $zipPath -Force

# Copy setup alongside
Copy-Item "$OutputDir\setup\RivertownAgentSetup.exe" "$OutputDir\RivertownAgentSetup.exe"

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output:"
Write-Host "  Agent zip:  $zipPath"
Write-Host "  Setup exe:  $OutputDir\RivertownAgentSetup.exe"
Write-Host "  Version:    $version"
Write-Host ""
Write-Host "To upload to the API:"
Write-Host "  1. Upload the zip to POST /api/v1/rmm/agent/upload"
Write-Host "  2. Or place in the AGENT_BUILDS_DIR directory"
Write-Host ""
