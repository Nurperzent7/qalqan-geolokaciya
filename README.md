# QALQAN · модуль геолокации (без Clockster)

Живой учёт приходов, уходов и рабочих визитов. Телефон шлёт GPS → сервер считает офис / визиты / чистое время → отметки уходят в **Битрикс24**. **2ГИС** — только справочник мест.

## Живой режим

- Общая база компании (Postgres на publish)
- День = сегодня (Asia/Qyzylorda)
- Вкладка **Телефон**: реальный GPS браузера
- Кнопка **В Битрикс** → `timeman.open` / `timeman.close` по вебхуку
- Демо-треки опционально: Настройки → «Загрузить демо-треки»

## Запуск локально

```bash
npm install
export APP_ADMIN_TOKEN='your-local-admin-password'
npm run dev
```

Dev-сервер: `http://127.0.0.1:3847`

## Секреты

- **APP_ADMIN_TOKEN** — пароль админа (обязательно)
- **BITRIX_WEBHOOK_URL** — входящий вебхук REST Bitrix24 (`…/rest/1/xxx`) для live-отметок
- **EMPLOYEE_PIN_HASHES** — опционально, JSON `{"e-askar":"salt:hash",…}` для входа сотрудников

## Стек

Next.js · TypeScript · Tailwind · Leaflet · Postgres
