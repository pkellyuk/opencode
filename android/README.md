# OpenCode Android

This project embeds the OpenCode web UI (`packages/app`) inside an Android `WebView` and talks to an OpenCode server instance.

## Required Server Fixes

For reliable Android behavior, use a server build that includes these commits:

- `6eaed36ec` - session loop end-condition fix in `packages/opencode/src/session/prompt.ts`
- `44302e8f5` - model reference/model fallback hardening in:
  - `packages/opencode/src/session/prompt.ts`
  - `packages/opencode/src/provider/provider.ts`

Without these server fixes, the app may still open/connect, but you can see issues such as:

- assistant responses disappearing or appearing to "vanish"
- model resolution failures for partial/malformed model refs

Desktop can appear fine without these patches because it often reuses already-valid model/session state and does not always hit the failing edge paths.

## Prerequisites

- .NET Android workload (`net10.0-android` target):
  ```powershell
  dotnet workload install android
  ```
- Android SDK + platform tools (`adb`)
- `bun` (used to build the web UI bundle)
- Java/JDK required by Android tooling

## Build The Embedded Web UI

From `android/`:

```powershell
.\build-web.ps1
```

This runs `bun run build` in `packages/app` and copies `packages/app/dist/*` into `android/Assets`.

## Build APK

From `android/`:

```powershell
dotnet publish -c Release -f net10.0-android -p:AndroidSdkDirectory="$env:LOCALAPPDATA\Android\Sdk"
```

Expected signed APK output:

`android/bin/Release/net10.0-android/com.companyname.OpenCode.Android-Signed.apk`

## Install And Run

### Emulator

```powershell
adb devices -l
adb install -r .\bin\Release\net10.0-android\com.companyname.OpenCode.Android-Signed.apk
adb shell monkey -p com.companyname.OpenCode.Android -c android.intent.category.LAUNCHER 1
```

### Physical Phone (Wireless Debugging)

```powershell
adb connect <phone-ip>:<port>
adb -s <phone-ip>:<port> install -r .\bin\Release\net10.0-android\com.companyname.OpenCode.Android-Signed.apk
adb -s <phone-ip>:<port> shell monkey -p com.companyname.OpenCode.Android -c android.intent.category.LAUNCHER 1
```

## Run OpenCode Server (Windows Host)

Typical headless server start:

```powershell
opencode serve --hostname 0.0.0.0 --port 4096
```

Notes:

- Android emulator should use `10.0.2.2:<port>` to reach host machine.
- Physical Android on LAN/ZeroTier should use the Windows node IP (example: `10.26.120.249:4096`).

## Default Server URL In Android App

`android/MainActivity.cs` currently defaults to:

- `http://10.26.120.249:4096`

Legacy saved values are auto-migrated:

- `http://10.0.2.2:4096`
- `http://192.168.0.200:4096`

You can still change server URL from Settings in the app.

## Troubleshooting

- UI looks reverted (double burger, missing mobile fixes):
  - Re-run `.\build-web.ps1`
  - Re-publish APK
  - Reinstall with `adb install -r ...`
- App opens but cannot connect:
  - Verify server is listening on host:
    ```powershell
    netstat -ano | findstr :4096
    ```
  - Verify network path:
    ```powershell
    Test-NetConnection -ComputerName <server-ip> -Port 4096
    ```
- Need a clean app state:
  ```powershell
  adb shell pm clear com.companyname.OpenCode.Android
  ```
