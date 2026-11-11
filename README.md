# QALQAN · модуль геолокации (без Clockster)

Живой учёт приходов и визитов для портала **[qalqanadvisors.bitrix24.kz](https://qalqanadvisors.bitrix24.kz/)**.  
Телефон → GPS → офис / визиты / чистое время → Bitrix `timeman.open` / `timeman.close`.

**Live:** https://qalqan-geolokaciya.apps.grok.bot  
**GitHub:** https://github.com/Nurperzent7/qalqan-geolokaciya

## Оценка (v0.2)

| | |
|--|--|
| Готовность к пилоту | **Да** — админ в браузере + сотрудники на Android |
| iOS | Проект готов; сборка IPA с Windows — через [Codemagic](./mobile/IOS-WITHOUT-MAC.md) |
| Связка Bitrix | Живая, webhook только на `qalqanadvisors.bitrix24.kz` |
| Безопасность | Сессии, scrypt-пароли 12+, rate-limit по IP и employee_id, CSRF |
| Слабое место | Состояние в памяти + snapshot Postgres (осторожно с несколькими инстансами); фон GPS на Android зависит от батареи OEM |

**Итог:** для внутреннего пилота QALQAN продукт рабочий. Сначала Android + 1–2 сотрудника на целый день; iOS — когда будет Apple Developer + Codemagic.

## Возможности

- Общая база компании (`live:company`, Postgres на publish)
- Сотрудники из Bitrix (`user.get`), исключения из ростера
- Выдача длинных паролей сотрудникам из админки
- Карта, журнал дня, визиты ↔ дела, справочник мест
- Capacitor Android/iOS: фоновый GPS
- Мобильный UI сотрудника: GPS · День · Визиты · Карта

## Секреты

| Secret | Назначение |
|--------|------------|
| `APP_ADMIN_TOKEN` | Пароль админа |
| `BITRIX_WEBHOOK_URL` | Входящий вебхук с правами **user** + **timeman** |
| `EMPLOYEE_PIN_HASHES` | Опционально, JSON `{"bx-12":"salt:hash",…}` |
| `DATABASE_URL` | Postgres на publish (обычно задаётся платформой) |

Пример вебхука: `https://qalqanadvisors.bitrix24.kz/rest/1/xxxxxxxx/`

## Локальный запуск

```bash
npm install
# Windows PowerShell:
$env:APP_ADMIN_TOKEN='your-local-admin-password'
$env:BITRIX_WEBHOOK_URL='https://qalqanadvisors.bitrix24.kz/rest/1/xxx'
npm run dev
```

Dev: http://127.0.0.1:3847

## Мобильное приложение

```bash
# Android (этот Windows)
cd mobile && npm install && npx cap sync android && npx cap open android

# iOS sync можно на Windows; IPA — только Mac или Codemagic
cd mobile && npm install && npx cap sync ios
```

- Android: [`mobile/README.md`](./mobile/README.md)
- iOS без Mac: [`mobile/IOS-WITHOUT-MAC.md`](./mobile/IOS-WITHOUT-MAC.md)
- В браузере GPS только при открытой вкладке; фон — только в приложении

## Стек

Next.js 16 · React 19 · TypeScript · Tailwind · Leaflet · Postgres · Bitrix24 REST · Capacitor 7
