# StudyMate Piston sandbox runtime installer (Windows PowerShell)
# ============================================================
# Installs Python / C / C++ runtimes into the piston-api container,
# then installs the fixed Python third-party whitelist from
# scripts/piston_python_libs.txt into the persistent piston_data volume.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/init-piston.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$PISTON = if ($env:PISTON_URL) { $env:PISTON_URL } else { "http://127.0.0.1:2000" }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LibsFile = if ($env:PISTON_PYTHON_LIBS_FILE) { $env:PISTON_PYTHON_LIBS_FILE } else { Join-Path $ScriptDir "piston_python_libs.txt" }

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
        $r = Invoke-WebRequest -Uri "$PISTON/api/v2/packages" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 1800
        Write-Host "    $($r.Content)"
    } catch {
        Write-Host "    ERR: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Install-Pkg "python"  "3.10.0"
# C / C++ come from the gcc package.
Install-Pkg "gcc"     "10.2.0"

if (-not (Test-Path $LibsFile)) {
    Write-Host "!! missing Python dependency list: $LibsFile" -ForegroundColor Red
    exit 1
}

$packages = Get-Content $LibsFile | Where-Object { $_ -match '^[a-zA-Z0-9_.-]+==[0-9]' }
if (-not $packages) {
    Write-Host "!! no package==version lines in $LibsFile" -ForegroundColor Red
    exit 1
}

Write-Host "==> Python third-party whitelist:" -ForegroundColor Cyan
$packages | ForEach-Object { Write-Host "    $_" }

$containerId = if ($env:PISTON_CONTAINER_ID) {
    $env:PISTON_CONTAINER_ID
} else {
    (docker compose ps -q piston-api 2>$null)
}
if (-not $containerId) {
    Write-Host "!! piston-api container not found; cannot install Python packages" -ForegroundColor Red
    exit 1
}

$runtimePython = "/piston/packages/python/3.10.0/bin/python3"
$pipIndex = if ($env:PISTON_PIP_INDEX_URL) { $env:PISTON_PIP_INDEX_URL } else { "https://mirrors.aliyun.com/pypi/simple/" }
$needInstall = @()
foreach ($spec in $packages) {
    $pkg = $spec.Split("==")[0]
    $importName = switch ($pkg) {
        "scikit-learn" { "sklearn" }
        "pillow" { "PIL" }
        default { $pkg }
    }
    docker exec -u piston $containerId $runtimePython -c "import $importName" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> Python $pkg already installed, skip"
    } else {
        $needInstall += $spec
    }
}

if ($needInstall.Count -gt 0) {
    Write-Host "==> Installing Python packages: $($needInstall -join ' ')" -ForegroundColor Cyan
    docker exec -u piston $containerId $runtimePython -m pip install --disable-pip-version-check --no-cache-dir --timeout 120 --index-url $pipIndex @needInstall
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Host "==> Python third-party packages already ready"
}

Write-Host ""
Write-Host "==> Installed runtimes:" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$PISTON/api/v2/runtimes" -UseBasicParsing
Write-Host $r.Content

$payload = @{
    language = "python"
    version = "3.10.0"
    files = @(@{
        name = "main.py"
        content = @"
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ.setdefault('OMP_NUM_THREADS','1')
os.environ.setdefault('MPLBACKEND','Agg')
import numpy, scipy, sklearn, matplotlib, PIL, pandas, networkx, seaborn
import matplotlib.pyplot as plt
plt.plot([0,1],[0,1])
print('sandbox-libs-ok')
"@
    })
    run_timeout = 10000
} | ConvertTo-Json -Depth 5 -Compress

$check = Invoke-WebRequest -Uri "$PISTON/api/v2/execute" -Method Post -Body $payload -ContentType "application/json" -UseBasicParsing -TimeoutSec 45
$checkObj = $check.Content | ConvertFrom-Json
if ($checkObj.run.code -ne 0 -or $checkObj.run.stdout.Trim() -ne "sandbox-libs-ok") {
    Write-Host "!! Python dependency runtime check failed: $($check.Content)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done. Python (numpy/scipy/sklearn/matplotlib/seaborn/pillow/pandas/networkx), C and C++ are ready." -ForegroundColor Green
Write-Host "Dependency list: $LibsFile"
