# QALQAN · мобильная оболочка (Capacitor)

Фоновый GPS для сотрудников. WebView открывает live-приложение  
https://qalqan-geolokaciya.apps.grok.bot  

Плагин `@capacitor-community/background-geolocation`:
- **Android** — уведомление «идёт сбор»
- **iOS** — режим фона `location` + разрешение **«Всегда»**

## Требования

| Платформа | Нужно |
|-----------|--------|
| Android | Android Studio, телефон/эмулятор |
| iOS | **Mac + Xcode**, Apple ID / Developer Program для установки на устройство |

На телефоне: геолокация **«Всегда» / Always**.

## Android

```bash
cd mobile
npm install
npx cap sync android
npx cap open android
```

Build → Build APK(s) или Run на устройстве.

## iOS (только macOS)

```bash
cd mobile
npm install
npx cap sync ios
npx cap open ios
```

В Xcode:

1. **Signing & Capabilities** — ваша Team / Bundle ID `kz.qalqan.geolokaciya`
2. При первом запуске на iPhone разрешите геолокацию, затем в **Настройки → QALQAN → Геолокация → Всегда**
3. Product → Run (или Archive для TestFlight / IPA)

`Info.plist` уже содержит тексты для When In Use / Always и `UIBackgroundModes: location`.

> С этой Linux-среды IPA собрать нельзя — нужен Mac. Проект `mobile/ios` уже в репозитории.

## Как пользуются сотрудники

1. Установить APK (Android) или приложение с TestFlight/Xcode (iOS)  
2. Войти: `bx-…` + длинный пароль от админа  
3. Админ включает сбор  
4. **Телефон → Включить GPS (фон)**  
5. Свернуть приложение — трек продолжается  

Админам по-прежнему удобен браузер на компьютере.
