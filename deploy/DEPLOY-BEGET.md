# Развёртывание my_treds на VPS Beget (Ubuntu 24.04)

Инструкция для [VPS Beget](https://beget.com/ru/vps#vps-plans-list) с образом **Ubuntu 24.04**. Подойдёт конфигурация от 1 ядра / 2 ГБ RAM.

## 1. Подготовка сервера

Подключитесь по SSH под пользователем **root** (IP и пароль — в панели Beget).

### Установка Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # должно быть v20.x
```

### Установка Nginx и PM2

```bash
sudo apt-get update
sudo apt-get install -y nginx
sudo npm install -g pm2
```

## 2. Клонирование и сборка проекта

```bash
cd ~
git clone https://github.com/bert1306/my_treds.git
cd my_treds
```

### Переменные окружения

```bash
cp .env.example .env
nano .env
```

Заполните (замените на свои значения):

```env
DATABASE_URL="file:./data/prod.db"
NEXT_PUBLIC_APP_URL="https://ваш-домен.ru"
OLLAMA_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="llama3.2"
```

- `NEXT_PUBLIC_APP_URL` — фактический URL сайта (нужен для писем восстановления пароля).
- Папку для БД создайте: `mkdir -p data`. Путь `./data/prod.db` — относительно корня проекта.

### Миграции и сборка

```bash
npm ci
npx prisma migrate deploy
npm run build
```

## 3. Запуск приложения под PM2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

После `pm2 startup` выполните команду, которую выведет PM2 (она добавит автозапуск при перезагрузке сервера).

Проверка: `pm2 status` и открытие в браузере `http://IP_СЕРВЕРА:3000`. Путь к проекту: `/root/my_treds`.

## 4. Nginx как обратный прокси

Скопируйте конфиг и подставьте свой домен:

```bash
sudo cp deploy/nginx-my_treds.conf /etc/nginx/sites-available/my_treds
sudo sed -i 's/YOUR_DOMAIN/ваш-домен.ru/' /etc/nginx/sites-available/my_treds
sudo ln -sf /etc/nginx/sites-available/my_treds /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Если домена ещё нет — можно временно подставить IP: `server_name 123.45.67.89;`.

## 5. HTTPS (рекомендуется)

Установите Certbot и получите сертификат Let's Encrypt:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен.ru
```

После этого обновите `NEXT_PUBLIC_APP_URL` в `.env` на `https://ваш-домен.ru` и перезапустите приложение:

```bash
pm2 restart my_treds
```

## 6. Ollama на сервере (опционально)

Чат по треду и перевод по ссылкам работают через Ollama. На VPS с 2 ГБ RAM модель может не поместиться; с 4+ ГБ можно попробовать:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama run llama3.2
```

Если Ollama не ставить — приложение будет работать, но чат по треду и перевод по ссылкам выдадут сообщение, что Ollama недоступна.

## 7. Обновление после изменений в репозитории

```bash
cd ~/my_treds
git pull
npm ci
npx prisma migrate deploy
npm run build
pm2 restart my_treds
```

## Полезные команды

| Действие              | Команда                |
|-----------------------|------------------------|
| Логи приложения       | `pm2 logs my_treds`    |
| Перезапуск            | `pm2 restart my_treds` |
| Статус                | `pm2 status`           |
| Проверка Nginx        | `sudo nginx -t`        |

## Минимальная конфигурация Beget

Подойдёт тариф **1 ядро, 2 ГБ RAM, 30 ГБ NVMe** (от 22 ₽/день). Для работы с Ollama и тяжёлыми запросами лучше **2 ядра, 4+ ГБ RAM**.
