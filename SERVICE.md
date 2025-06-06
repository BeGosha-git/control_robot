# Настройка автозапуска Control Center

## Требования
- Ubuntu Linux
- Node.js >= 12.0.0 (рекомендуется LTS версия)
- npm >= 6.0.0
- sudo права

## Установка Node.js (если не установлен)

1. Добавление NodeSource репозитория:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
```

2. Установка Node.js:
```bash
sudo apt-get install -y nodejs
```

3. Проверка версий:
```bash
node --version
npm --version
```


## Создание systemd сервиса

1. Создание файла сервиса:
```bash
sudo nano /etc/systemd/system/control_center.service
```

2. Вставьте следующую конфигурацию (замените `unitree` на вашего пользователя):
```ini
[Unit]
Description=Control Center Backend Service
After=network.target

[Service]
Type=simple
User=unitree
WorkingDirectory=/home/unitree/control_center/backend
ExecStart=/home/unitree/.nvm/versions/node/$(node -v | cut -d'v' -f2)/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=PATH=/home/unitree/.nvm/versions/node/$(node -v | cut -d'v' -f2)/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
```

## Активация и управление сервисом

1. Активация сервиса:
```bash
# Перезагрузка конфигурации systemd
sudo systemctl daemon-reload

# Включение автозапуска
sudo systemctl enable control_center

# Запуск сервиса
sudo systemctl start control_center
```

2. Проверка статуса:
```bash
# Проверка состояния сервиса
sudo systemctl status control_center

# Просмотр логов
sudo journalctl -u control_center -f
```

3. Управление сервисом:
```bash
# Остановка сервиса
sudo systemctl stop control_center

# Перезапуск сервиса
sudo systemctl restart control_center

# Отключение автозапуска
sudo systemctl disable control_center
```

## Устранение проблем

1. Если возникают проблемы с правами доступа:
```bash
sudo chown -R unitree:unitree /home/unitree/control_center
```

2. Если сервис не запускается, проверьте:
   - Правильность пути к проекту
   - Версию Node.js
   - Права доступа к папкам
   - Логи сервиса: `sudo journalctl -u control_center -f`

3. Для изменения конфигурации:
```bash
# Редактирование конфигурации
sudo nano /etc/systemd/system/control_center.service

# После изменений
sudo systemctl daemon-reload
sudo systemctl restart control_center
```

## Примечания
- Сервис настроен на автоматический перезапуск при сбоях
- Запускается после загрузки сети
- Использует переменные окружения NODE_ENV=production и PORT=3001
- Логи доступны через journalctl 