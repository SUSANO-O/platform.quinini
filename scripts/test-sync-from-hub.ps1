# Prueba POST /api/internal/sync-from-hub (mismo cuerpo que envía AIBackHub).
# Uso: .\scripts\test-sync-from-hub.ps1
#      .\scripts\test-sync-from-hub.ps1 -ClientAgentId 507f1f77bcf86cd799439011
# Requiere: landing en $LandingUrl (por defecto http://127.0.0.1:3201) y HUB_TO_LANDING_SECRET en .env

param(
  [string]$ClientAgentId = '69d56daf450d7f8e45e6cfc1'
)

$ErrorActionPreference = 'Stop'
# agent-flow-landing/scripts/ -> agent-flow-landing/.env
$landingRoot = Split-Path -Parent $PSScriptRoot

$LandingUrl = if ($env:AGENT_LANDING_TEST_URL) { $env:AGENT_LANDING_TEST_URL.TrimEnd('/') } else { 'http://127.0.0.1:3201' }
$secretPath = Join-Path $landingRoot '.env'
$secret = $null
if (Test-Path $secretPath) {
  Get-Content $secretPath | ForEach-Object {
    if ($_ -match '^\s*HUB_TO_LANDING_SECRET=(.+)$') { $secret = $Matches[1].Trim() }
  }
}
if (-not $secret) {
  Write-Error 'No se encontró HUB_TO_LANDING_SECRET en agent-flow-landing/.env'
}

$body = @"
{
  "agentHubId": "nuevo-agente",
  "name": "Test script",
  "description": "sync test",
  "prompt": "p",
  "model": "gemini-2.5-flash",
  "status": "active",
  "landingClientAgentId": "$ClientAgentId"
}
"@

Write-Host "POST $LandingUrl/api/internal/sync-from-hub"
$tmp = [System.IO.Path]::GetTempFileName()
try {
  Set-Content -Path $tmp -Value $body -Encoding utf8
  curl.exe -sS -X POST "$LandingUrl/api/internal/sync-from-hub" `
    -H "Content-Type: application/json" `
    -H "x-hub-sync-secret: $secret" `
    --data-binary "@$tmp"
  Write-Host ""
} finally {
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}
