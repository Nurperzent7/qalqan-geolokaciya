# QALQAN · модуль геолокации (без Clockster)

Живой учёт приходов и визитов для портала **[qalqanadvisors.bitrix24.kz](https://qalqanadvisors.bitrix24.kz/)**. Телефон шлёт GPS → офис / визиты / чистое время → `timeman.open` / `timeman.close`.

## Живой режим

- Общая база компании (Postgres на publish)
- Сотрудники с этого Битрикс (`user.get`)
- День = сегодня (Asia/Qyzylorda)
- Вкладка **Телефон**: только реальный GPS
- Офис по координатам

## Секреты

- **APP_ADMIN_TOKEN** — пароль админа
- **BITRIX_WEBHOOK_URL** — входящий вебхук именно с `qalqanadvisors.bitrix24.kz`  
  (Разработчикам → Другое → Входящий вебхук → права **user** и **timeman**).  
  Вид: `https://qalqanadvisors.bitrix24.kz/rest/1/xxxxxxxx/`
- **EMPLOYEE_PIN_HASHES** — опционально, JSON `{"bx-12":"salt:hash",…}`

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
