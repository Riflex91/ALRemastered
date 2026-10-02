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

$Csc = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Csc) { throw "The Windows C# compiler was not found." }

$LauncherExe = Join-Path $Stage "ALRemastered.exe"
& $Csc /nologo /target:exe /platform:anycpu "/out:$LauncherExe" "installer\windows\Launcher.cs"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $LauncherExe)) {
  throw "ALRemastered.exe launcher build failed."
}

$MakeNsis = @(
  "$env:ProgramFiles\NSIS\makensis.exe",
  "${env:ProgramFiles(x86)}\NSIS\makensis.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $MakeNsis) { throw "NSIS makensis.exe was not found." }

& $MakeNsis "/DAPP_VERSION=$Version" "/DSTAGE_DIR=$Stage" "/DOUT_FILE=$OutFile" "installer\windows\ALRemastered.nsi"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $OutFile)) { throw "NSIS installer build failed." }
Write-Host "Created $OutFile"
