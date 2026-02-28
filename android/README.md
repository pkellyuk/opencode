# OpenCode Android

This app embeds the OpenCode web UI (from `packages/app`) inside a native Android WebView and connects to your OpenCode server.

## Build Web UI
```powershell
.\build-web.ps1
```

## Run (emulator or device)
```powershell
dotnet build
dotnet run -f net10.0-android
```

## Server URL
- First launch uses the last server URL saved in the app (if any).
- You can change the server URL from within the OpenCode UI.
