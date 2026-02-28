$ErrorActionPreference = "Stop"

Push-Location ..\packages\app
bun run build
Pop-Location

Copy-Item -Recurse -Force ..\packages\app\dist\* .\Assets
