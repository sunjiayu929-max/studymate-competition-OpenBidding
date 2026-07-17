# StudyMate Piston sandbox runtime installer (Windows PowerShell)
# ============================================================
# Installs Python / C / C++ runtimes into the piston-api container.
# Runtime tarballs are fetched from piston upstream once, then cached
# inside docker volume `piston_data`. Subsequent boots are offline.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/init-piston.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$PISTON = if ($env:PISTON_URL) { $env:PISTON_URL } else { "http://127.0.0.1:2000" }

Write-Host "==> Waiting for piston-api ($PISTON) ..." -ForegroundColor Cyan
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$PISTON/api/v2/runtimes" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            Write-Host "    piston-api OK"
            $ready = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Host "!! piston-api not ready in 30s. Check 'docker ps' and 'docker logs studymate-piston'." -ForegroundColor Red
    exit 1
}

function Install-Pkg($lang, $ver) {
    Write-Host "==> Installing $lang $ver ..." -ForegroundColor Cyan
    $body = @{ language = $lang; version = $ver } | ConvertTo-Json -Compress
    try {
        $r = Invoke-WebRequest -Uri "$PISTON/api/v2/packages" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 180
        Write-Host "    $($r.Content)"
    } catch {
        Write-Host "    ERR: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Install-Pkg "python"  "3.10.0"
# C / C++ 由 gcc 包提供（piston 包名是 gcc，装一个同时给 c + c++ 运行时）；
# 早期写成 c / c++ 会报 "package does not exist"。
Install-Pkg "gcc"     "10.2.0"

Write-Host ""
Write-Host "==> Installed runtimes:" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$PISTON/api/v2/runtimes" -UseBasicParsing
Write-Host $r.Content

Write-Host ""
Write-Host "Done. Code execution stays inside docker network from now on." -ForegroundColor Green
