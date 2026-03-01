$ErrorActionPreference = "Stop"

Push-Location (Join-Path $PSScriptRoot "..\\packages\\app")
bun run build
Pop-Location

$assetsDir = Join-Path $PSScriptRoot "Assets"
$distDir = Join-Path $PSScriptRoot "..\\packages\\app\\dist"

if (Test-Path $assetsDir) {
  Get-ChildItem -Path $assetsDir -Force | Remove-Item -Recurse -Force
} else {
  New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

Copy-Item -Path (Join-Path $distDir "*") -Destination $assetsDir -Recurse -Force
