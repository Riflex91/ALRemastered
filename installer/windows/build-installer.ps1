$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

if (-not (Test-Path "build\package")) {
  throw "Build output is missing. Run 'npm run build' first."
}

$Node = (Get-Command node -ErrorAction Stop).Source
$Package = Get-Content "package.json" -Raw | ConvertFrom-Json
$Version = $Package.version
$Arch = $env:PROCESSOR_ARCHITECTURE
if ($Arch -notin @("AMD64", "ARM64")) { throw "Unsupported Windows build architecture: $Arch" }
$ProductArch = if ($Arch -eq "ARM64") { "arm64" } else { "x64" }

$Stage = Join-Path $Root "build\installer-windows\stage"
$Artifacts = Join-Path $Root "artifacts"
$OutFile = Join-Path $Artifacts "ALRemastered-Windows-$ProductArch-Setup.exe"
Remove-Item (Join-Path $Root "build\installer-windows") -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $Stage "app") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Stage "runtime") -Force | Out-Null
New-Item -ItemType Directory -Path $Artifacts -Force | Out-Null
Copy-Item "build\package\*" (Join-Path $Stage "app") -Recurse -Force
Copy-Item $Node (Join-Path $Stage "runtime\node.exe") -Force

$Launcher = @'
@echo off
setlocal
set "BASE=%~dp0"
"%BASE%runtime\node.exe" "%BASE%app\src\main.js" %*
'@
Set-Content -Path (Join-Path $Stage "ALRemastered.cmd") -Value $Launcher -Encoding Ascii

$Candidates = @(
  "$env:ProgramFiles\NSIS\makensis.exe",
  "${env:ProgramFiles(x86)}\NSIS\makensis.exe"
) | Where-Object { $_ -and (Test-Path $_) }
if ($Candidates.Count -eq 0) { throw "NSIS makensis.exe was not found." }
$MakeNsis = $Candidates[0]

& $MakeNsis "/DAPP_VERSION=$Version" "/DSTAGE_DIR=$Stage" "/DOUT_FILE=$OutFile" "installer\windows\ALRemastered.nsi"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $OutFile)) { throw "NSIS installer build failed." }
Write-Host "Created $OutFile"
