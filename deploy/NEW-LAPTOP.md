# Переход на новый ноутбук — что взять со старого

Разработка и деплой идут на **Beget VPS** (root@5.35.89.34). Ниже — что перенести и как настроить новый компьютер.

---

## 1. Скопировать со старого ноутбука

### SSH-ключ для Beget (обязательно)

Без него не будет доступа к серверу по SSH.

- **Файлы:**  
  `~/.ssh/id_ed25519_beget`  
  `~/.ssh/id_ed25519_beget.pub`

Скопируйте оба в ту же папку на новом ноутбуке (`~/.ssh/`). Права:
```bash
chmod 600 ~/.ssh/id_ed25519_beget
chmod 644 ~/.ssh/id_ed25519_beget.pub
```

### Опционально: конфиг SSH

Если на старом ноутбуке в `~/.ssh/config` был блок для Beget, перенесите его:

```
Host beget-my_treds
    HostName 5.35.89.34
    User root
    IdentityFile ~/.ssh/id_ed25519_beget
```

### Данные для деплоя (если хранили локально)

- Файл **`deploy/CONNECTION.txt`** (если не коммитили в git):  
  на новом ноутбуке создайте его из `deploy/CONNECTION.txt.example`, подставьте свой IP и путь к проекту на сервере.

- Локальный **`.env`** (если был):  
  в репозитории есть `.env.example`. На новом ноутбуке сделайте `cp .env.example .env` и при необходимости поправьте значения.

---

## 2. На новом ноутбуке

### Репозиторий и окружение

```bash
git clone https://github.com/bert1306/my_treds.git
cd my_treds
npm install
cp .env.example .env   # и отредактируйте при необходимости
cp deploy/CONNECTION.txt.example deploy/CONNECTION.txt
# В CONNECTION.txt укажите: SSH=root@5.35.89.34, DIR=/root/my_treds
```

### Проверка доступа к серверу

```bash
ssh -i ~/.ssh/id_ed25519_beget root@5.35.89.34 "echo ok"
# или, если настроен алиас:
ssh beget-my_treds "echo ok"
```

Если видите `ok` — доступ есть, можно деплоить и разрабатывать дальше.

### Деплой изменений на Beget

После правок в коде (с нового ноутбука):

```bash
git add -A && git commit -m "..." && git push
```

На сервере (через SSH):

```bash
cd /root/my_treds && git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 restart my_treds
```

Или попросите ассистента выполнить деплой (у него будет доступ по SSH, если ключ и `deploy/CONNECTION.txt` настроены на новом ноутбуке).

---

## 3. Что уже лежит в репозитории

- Инструкции по деплою: **deploy/DEPLOY-BEGET.md**
- Настройка SSH под root: **deploy/SETUP-SSH.md**
- Конфиги: **deploy/nginx-my_treds.conf**, **deploy/ecosystem.config.cjs**
- Шаблон данных сервера: **deploy/CONNECTION.txt.example**

Сервер уже развёрнут: **http://5.35.89.34** (Nginx + PM2, приложение в `/root/my_treds`).
