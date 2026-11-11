# QALQAN · мобильная оболочка (Capacitor)

Фоновый GPS для сотрудников. WebView открывает live-приложение  
https://qalqan-geolokaciya.apps.grok.bot  
Плагин `@capacitor-community/background-geolocation` продолжает точки при свёрнутом приложении (уведомление на Android, «Всегда» на iOS).

## Требования

- Node 20+
- Android Studio (APK) и/или Xcode на macOS (IPA)
- На телефоне: разрешение геолокации **«Всегда» / Allow all the time**

## Сборка Android

```bash
cd mobile
npm install
npx cap add android   # один раз
npx cap sync android
npx cap open android
```

В Android Studio: Run на устройстве или **Build → Build APK(s)**.

Проверьте в `android/app/src/main/AndroidManifest.xml` (после sync плагин обычно добавляет сам):

- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION`

## Сборка iOS (macOS)

```bash
cd mobile
npx cap add ios
npx cap sync ios
npx cap open ios
```

В Xcode → Signing + Privacy: Location Always and When In Use.

## Как пользуются сотрудники

1. Установить APK/IPA QALQAN Геолокация  
2. Войти: `bx-…` + PIN  
3. Админ включает сбор  
4. Вкладка **Телефон → Включить GPS (фон)**  
5. Можно свернуть приложение — трек продолжается, админ видит на карте  

Админам по-прежнему удобен браузер на компьютере.
