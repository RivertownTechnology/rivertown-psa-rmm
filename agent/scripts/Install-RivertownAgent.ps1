<#
.SYNOPSIS
    Installs the Rivertown RMM Agent as a Windows Service.
.PARAMETER Token
    Enrollment token generated from Settings > RMM in the Rivertown PSA dashboard.
.PARAMETER ApiUrl
    The API server URL (e.g., https://psa.yourcompany.com or http://localhost:3000).
.PARAMETER MqttUrl
    MQTT broker URL. Use wss:// for WebSocket over TLS (default: wss://rmm.rivertowntechnology.com).
    For local dev, use mqtt://localhost:1883 or ws://localhost:9001.
.PARAMETER InstallPath
    Installation directory (default: C:\Program Files\Rivertown\Agent).
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$Token,

    [string]$ApiUrl = "https://psa.rivertowntechnology.com",
    [string]$MqttUrl = "wss://rmm.rivertowntechnology.com",
    [string]$InstallPath = "C:\Program Files\Rivertown\Agent"
)

$ErrorActionPreference = "Stop"
$ServiceName = "RivertownRMMAgent"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Rivertown RMM Agent Installer v0.1.0" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "API Server:  $ApiUrl"
Write-Host "MQTT Broker: $MqttUrl"
Write-Host "Install Path: $InstallPath"
Write-Host ""

# 1. Check admin
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    exit 1
}

# 2. Stop existing service if running
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Stopping existing service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
}

# 3. Create install directory
Write-Host "Creating install directory..."
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

# 4. Copy agent files (assumes this script is run from the publish directory)
$publishDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentExe = Join-Path $publishDir "Rivertown.Agent.Core.exe"
if (Test-Path $agentExe) {
    Write-Host "Copying agent files..."
    Copy-Item -Path "$publishDir\*" -Destination $InstallPath -Recurse -Force
} else {
    Write-Host "WARNING: Agent executable not found in script directory." -ForegroundColor Yellow
    Write-Host "Make sure to copy the published agent files to: $InstallPath" -ForegroundColor Yellow
}

# 5. Create config
Write-Host "Writing configuration..."
$configDir = Join-Path $env:ProgramData "Rivertown\Agent"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null

$config = @{
    AgentId = ""
    TenantId = ""
    CustomerId = ""
    MqttBrokerUrl = $MqttUrl
    MqttBrokerPort = 0
    ApiBaseUrl = $ApiUrl
    EnrollmentToken = $Token
    IsEnrolled = $false
} | ConvertTo-Json -Depth 10

Set-Content -Path (Join-Path $configDir "agent-config.json") -Value $config -Encoding UTF8

# 6. Install as Windows Service
Write-Host "Installing Windows Service..."
$exePath = Join-Path $InstallPath "Rivertown.Agent.Core.exe"
sc.exe create $ServiceName binPath= "`"$exePath`"" start= auto DisplayName= "Rivertown RMM Agent" | Out-Null
sc.exe description $ServiceName "Rivertown PSA/RMM endpoint management agent" | Out-Null

# 7. Start the service
Write-Host "Starting service..."
Start-Service -Name $ServiceName

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Agent installed and started successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "The agent will now:"
Write-Host "  1. Enroll with the API server using the provided token"
Write-Host "  2. Connect to the MQTT broker"
Write-Host "  3. Begin sending heartbeats every 60 seconds"
Write-Host ""
Write-Host "Check the RMM section in the dashboard to verify the agent appears."
Write-Host ""
