# Help Prompt

Веб-чат для сбора данных о пользователях и генерации промптов под ИИ. Позже — интеграция в Telegram.

## Запуск

```bash
cp .env.example .env
mkdir -p data
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Открыть http://localhost:3001

## Продакшен (Beget)

```bash
npm ci
npx prisma generate
npx prisma db push
npm run build
PORT=3000 npm run start
```
