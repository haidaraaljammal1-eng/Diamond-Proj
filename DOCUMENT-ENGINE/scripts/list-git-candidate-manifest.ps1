# Lists files proposed for DOCUMENT-ENGINE Git delivery (excludes git-manifest-excludes.txt patterns).
param(
    [string]$DocEngineRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$OutFile = "",
    [switch]$ScanProhibited
)

$ErrorActionPreference = "Stop"
$excludeFile = Join-Path $DocEngineRoot "git-manifest-excludes.txt"
$patterns = @()
if (Test-Path $excludeFile) {
    $patterns = Get-Content $excludeFile | Where-Object { $_ -and -not $_.StartsWith("#") }
}

function Test-Excluded([string]$relative) {
    $rel = ($relative -replace "\\", "/").TrimStart("/")
    if ($rel -match "(^|/)\.venv[^/]*(/|$)") { return $true }
    if ($rel -match "(^|/)venv(/|$)") { return $true }
    if ($rel -match "/site-packages/") { return $true }
    foreach ($pat in $patterns) {
        $p = ($pat.Trim() -replace "\\", "/").TrimStart("/")
        if (-not $p) { continue }
        if ($p.EndsWith("/")) {
            if ($rel -eq $p.TrimEnd("/") -or $rel.StartsWith($p)) { return $true }
        } elseif ($p.StartsWith("**/")) {
            $suffix = $p.Substring(3)
            if ($rel -like "*$suffix" -or $rel -eq $suffix) { return $true }
        } else {
            if ($rel -eq $p -or $rel.StartsWith("$p/")) { return $true }
        }
    }
    return $false
}

$files = Get-ChildItem -Path $DocEngineRoot -Recurse -File -Force |
    Where-Object {
        $rel = $_.FullName.Substring($DocEngineRoot.Length + 1)
        -not (Test-Excluded $rel)
    } |
    Sort-Object FullName

$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
$large = $files | Where-Object { $_.Length -gt 1MB } | Sort-Object Length -Descending

Write-Host "DOCUMENT-ENGINE candidate manifest"
Write-Host "  files: $($files.Count)"
Write-Host "  bytes: $totalBytes"
Write-Host "  >1MB: $($large.Count)"

if ($OutFile) {
    $files | ForEach-Object { $_.FullName.Substring($DocEngineRoot.Length + 1) } | Set-Content -Encoding utf8 $OutFile
    Write-Host "  wrote: $OutFile"
}

if ($ScanProhibited) {
    $bad = @()
    foreach ($f in $files) {
        $rel = ($f.FullName.Substring($DocEngineRoot.Length + 1) -replace "\\", "/").ToLower()
        $ext = $f.Extension.ToLower()
        if ($rel -match "(^|/)\.venv[^/]*(/|$)|(^|/)venv(/|$)|site-packages|/vendor/") { $bad += $rel; continue }
        if ($rel -match "setup\.ps1|(^|/)setup/|/setup/") { $bad += $rel; continue }
        if ($ext -in @(".onnx", ".pdiparams", ".pdmodel")) { $bad += $rel; continue }
        if ($rel -match "(passport|licen[cs]e|mrz).*(sample|fixture|real)" -and $ext -in @(".jpg", ".jpeg", ".png", ".pdf")) { $bad += $rel; continue }
        if ($ext -eq ".env" -or $rel -match "/\.env") { $bad += $rel; continue }
    }
    if ($bad.Count) {
        Write-Host "PROHIBITED in candidate: $($bad.Count)" -ForegroundColor Red
        $bad | Select-Object -First 30 | ForEach-Object { Write-Host "  $_" }
        exit 2
    }
    Write-Host "Prohibited scan: 0 hits" -ForegroundColor Green
}

return $files
