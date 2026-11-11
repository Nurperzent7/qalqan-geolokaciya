/**
 * Native shell loads the published QALQAN web app and runs
 * @capacitor-community/background-geolocation for background GPS.
 *
 * Build:
 *   cd mobile && npx cap sync android
 *   npx cap open android   # Android Studio → Run / Build APK
 *   npx cap open ios       # Xcode (macOS)
 */
const config = {
  appId: "kz.qalqan.geolokaciya",
  appName: "QALQAN Геолокация",
  webDir: "www",
  server: {
    // Live published app — same API + UI, native plugins attach in WebView.
    url: "https://qalqan-geolokaciya.apps.grok.bot",
    cleartext: false,
  },
  plugins: {
    BackgroundGeolocation: {},
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#ebe4d6",
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#ebe4d6",
  },
} as const;

export default config;
