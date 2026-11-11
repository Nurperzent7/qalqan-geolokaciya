# Build QALQAN debug APK on Windows (free, no Play Store).
# Requires: JDK 21, Android SDK (local.properties), Capacitor sync already done.

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root "mobile\android"))) {
  $root = Split-Path $PSScriptRoot -Parent
}
$androidDir = Join-Path $root "mobile\android"
$sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$jdk = Get-ChildItem "C:\Program Files\Microsoft" -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "jdk-21*" } |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $jdk) { throw "Install Microsoft OpenJDK 21 (winget install Microsoft.OpenJDK.21)" }
if (-not (Test-Path $sdkRoot)) { throw "Android SDK not found at $sdkRoot" }

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$jdk\bin;$sdkRoot\platform-tools;$sdkRoot\emulator;" + $env:Path

$sdkPath = ($sdkRoot -replace '\\', '/')
[System.IO.File]::WriteAllText(
  (Join-Path $androidDir "local.properties"),
  "sdk.dir=$sdkPath`n",
  (New-Object System.Text.UTF8Encoding $false)
)

Push-Location $androidDir
try {
  .\gradlew.bat assembleDebug --no-daemon
  $apk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
  $out = Join-Path (Split-Path $root -Parent) "qalqan-geolokaciya-debug.apk"
  if (-not (Test-Path $apk)) { $out = Join-Path $root "..\qalqan-geolokaciya-debug.apk" }
  # Prefer Desktop\qalqan geo folder next to repo
  $desktopCopy = Join-Path (Split-Path $root -Parent) "qalqan-geolokaciya-debug.apk"
  Copy-Item $apk $desktopCopy -Force
  Write-Host "APK: $desktopCopy"
  Write-Host "Source: $apk"
} finally {
  Pop-Location
}
