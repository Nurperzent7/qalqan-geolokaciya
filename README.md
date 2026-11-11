# QALQAN · модуль геолокации (без Clockster)

Живой учёт приходов и визитов. Сотрудники и отметки рабочего дня — из **Битрикс24**. Телефон шлёт GPS → офис / визиты / чистое время → `timeman.open` / `timeman.close`.

## Живой режим

- Общая база компании (Postgres на publish)
- Список сотрудников подтягивается из Битрикс (`user.get`)
- День = сегодня (Asia/Qyzylorda)
- Вкладка **Телефон**: только реальный GPS (симуляция отключена)
- Офис определяется по координатам, не по Wi‑Fi с телефона

## Секреты

- **APP_ADMIN_TOKEN** — пароль админа
- **BITRIX_WEBHOOK_URL** — входящий вебхук REST (`…/rest/1/xxx`) с правами `user` и `timeman`
- **EMPLOYEE_PIN_HASHES** — опционально, JSON `{"bx-12":"salt:hash",…}` для входа сотрудников

## Запуск локально

```bash
npm install
export APP_ADMIN_TOKEN='your-local-admin-password'
export BITRIX_WEBHOOK_URL='https://your.bitrix24.kz/rest/1/xxx'
npm run dev
```

Dev-сервер: `http://127.0.0.1:3847`

## Стек

Next.js · TypeScript · Tailwind · Leaflet · Postgres · Bitrix24 REST
