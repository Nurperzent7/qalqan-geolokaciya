# iOS без Mac (Windows)

На Windows **нельзя** поставить Xcode и собрать `.ipa` локально.  
Проект `mobile/ios` уже в репозитории — собирать его нужно в облаке.

## Что выбрать сейчас

| Цель | Как |
|------|-----|
| Сотрудники на Android | Соберите APK на этом Windows (Android Studio) |
| Сотрудники на iPhone | Облачная сборка + TestFlight (нужен Apple Developer) |
| Быстро проверить без фона GPS | Safari / Chrome → https://qalqan-geolokaciya.apps.grok.bot |

Фоновый GPS на iPhone работает **только** в установленном приложении (не в браузере).

## Нужен Apple Developer

1. Аккаунт: https://developer.apple.com/programs/ (~$99 / год)  
2. Без него IPA на чужой iPhone через TestFlight не поставить.  
3. Bundle ID уже задан: `kz.qalqan.geolokaciya`

## Рекомендуемый путь: Codemagic (облачный Mac)

1. Запушьте репозиторий на GitHub (`Nurperzent7/qalqan-geolokaciya`).  
2. Зайдите на https://codemagic.io → **Sign up with GitHub** → добавьте этот репозиторий.  
3. В Codemagic: **Teams → Integrations → App Store Connect**  
   - создайте API Key в App Store Connect (Users and Access → Keys)  
   - вставьте Issuer ID, Key ID, `.p8` файл  
4. Включите code signing для `kz.qalqan.geolokaciya` (automatic).  
5. В App Store Connect создайте приложение с тем же Bundle ID.  
6. В `codemagic.yaml` замените `APP_STORE_APPLE_ID` на Apple ID приложения (цифры).  
7. Запустите workflow **QALQAN iOS** → получите сборку в **TestFlight**.  
8. На iPhone: App Store → TestFlight → установить QALQAN → Геолокация → **Всегда**.

Файл конфигурации уже в корне: [`codemagic.yaml`](../codemagic.yaml).

## Альтернативы

- **MacinCloud / MacStadium** — аренда удалённого Mac по часам, открыть Xcode руками.  
- **Попросить коллегу с Mac** один раз: `cd mobile && npm i && npx cap sync ios && npx cap open ios`.  
- **Только Android** для пилота QALQAN — быстрее и без Apple Developer.

## После облачной сборки — чеклист на iPhone

1. Войти: `bx-…` + пароль от админа  
2. Админ включает сбор  
3. Вкладка **GPS → Включить GPS (фон)**  
4. Система: **Настройки → QALQAN → Геолокация → Всегда**  
5. Свернуть приложение и проехать/пройти маршрут теста
