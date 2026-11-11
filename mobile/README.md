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

## Android (бесплатно, без Play Store)

### Готовый debug APK

В репозитории: [`mobile/releases/qalqan-geolokaciya-debug.apk`](./releases/qalqan-geolokaciya-debug.apk)  
Скачать с GitHub: https://github.com/Nurperzent7/qalqan-geolokaciya/raw/main/mobile/releases/qalqan-geolokaciya-debug.apk

Пересобрать:

```powershell
cd mobile
npm install
npx cap sync android
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-apk.ps1
```

Нужны: **JDK 21**, Android SDK (`%LOCALAPPDATA%\Android\Sdk`), AEHD для эмулятора.

### Android Studio / эмулятор

```bash
cd mobile
npm install
npx cap sync android
npx cap open android
```

В Android Studio: Device Manager → создать/запустить Virtual Device → Run.  
На телефон сотруднику: скопировать `.apk` и разрешить установку из неизвестных источников.

## iOS

Локально Xcode есть **только на Mac**.  
Если у вас Windows — см. подробную инструкцию: **[IOS-WITHOUT-MAC.md](./IOS-WITHOUT-MAC.md)** (Codemagic → TestFlight).

### Если Mac всё же есть

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

## Как пользуются сотрудники

1. Установить APK (Android) или приложение с TestFlight/Xcode (iOS)  
2. Войти: `bx-…` + длинный пароль от админа (в приложении сразу экран сотрудника)  
3. Админ включает сбор  
4. Нижняя вкладка **GPS → Включить GPS (фон)**  
5. Свернуть приложение — трек продолжается  
6. **День** / **Визиты** / **Карта** — короткий обзор своего дня  

В приложении UI упрощён под телефон (нижняя навигация). Админам по-прежнему удобен браузер на компьютере.

### Android: батарея

На Xiaomi / Huawei / Samsung: Настройки → Приложения → QALQAN → Батарея → **Без ограничений**, иначе фон GPS может остановиться.
