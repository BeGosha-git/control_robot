# H1 Robot Control System

Система управления роботом H1 с веб-интерфейсом для мониторинга и управления.

## Особенности

- **Веб-интерфейс**: Современный React интерфейс с Material-UI
- **Управление камерами**: Поддержка всех доступных USB камер с Python сервисом
- **Файловый менеджер**: Управление файлами робота
- **Выполнение команд**: Запуск и мониторинг команд на роботе
- **3D визуализация**: Отображение состояния робота в 3D

## Структура проекта

```
h1_site/
├── frontend/          # React приложение
├── backend/           # Node.js сервер + Python сервис камер
│   ├── src/
│   │   └── services/
│   │       └── camera_service.py  # Python сервис для работы с камерами
│   ├── server.js      # Node.js сервер (прокси)
│   └── requirements.txt # Python зависимости
└── README.md
```

## Установка и запуск

### 1. Установка зависимостей

#### Backend (Node.js)
```bash
cd backend
npm install
```

#### Backend (Python)
```bash
cd backend
pip install -r requirements.txt
```

#### Frontend
```bash
cd frontend
npm install
```

### 2. Запуск сервисов

#### Запуск Python сервиса камер
```bash
cd backend
python start_camera_service.py
```

#### Запуск Node.js сервера (в отдельном терминале)
```bash
cd backend
npm start
```

#### Запуск фронтенда (в отдельном терминале)
```bash
cd frontend
npm start
```

### 3. Доступ к приложению

- **Фронтенд**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Python сервис камер**: http://localhost:5000

## API камер

### Получение списка камер
```
GET /api/cameras
```

### Запуск всех камер
```
POST /api/cameras/start-all
```

### Остановка всех камер
```
POST /api/cameras/stop-all
```

### Запуск конкретной камеры
```
POST /api/camera/{id}/start
```

### Остановка конкретной камеры
```
POST /api/camera/{id}/stop
```

### Получение кадров со всех камер
```
GET /api/cameras/frames
```

### Стрим кадров (Server-Sent Events)
```
GET /api/cameras/stream
```

## Особенности работы с камерами

- **Автообнаружение**: Система автоматически находит все доступные USB камеры
- **Многопоточность**: Каждая камера работает в отдельном потоке
- **Сжатие**: Кадры сжимаются в JPEG для экономии трафика
- **Реальное время**: Стрим кадров в реальном времени через Server-Sent Events
- **Управление**: Возможность запуска/остановки отдельных камер или всех сразу

## Требования

- Node.js >= 16.8.0
- Python >= 3.7
- OpenCV (opencv-python)
- Flask
- USB камеры (для работы с видео)

## Устранение неполадок

### Камеры не обнаружены
1. Убедитесь, что камеры подключены к USB
2. Проверьте права доступа к устройствам
3. Установите драйверы камер

### Ошибки Python сервиса
1. Проверьте установку зависимостей: `pip install -r requirements.txt`
2. Убедитесь, что OpenCV установлен корректно
3. Проверьте логи в консоли

### Проблемы с подключением
1. Убедитесь, что все сервисы запущены
2. Проверьте порты (3000, 3001, 5000)
3. Проверьте CORS настройки

## Лицензия

MIT License

## Управление

### Запуск
```bash
sudo ./start_h1_unified.sh
```

### Остановка
```bash
./stop_h1.sh
```

### Просмотр логов
```bash
# Логи backend
tail -f /home/unitree/backend.log

# Логи frontend
docker compose logs -f

# Логи системного сервиса
sudo journalctl -u h1-control -f
```

### Перезапуск
```bash
sudo ./start_h1_unified.sh
```

### Управление системным сервисом
```bash
# Статус сервиса
sudo systemctl status h1-control

# Просмотр логов
sudo journalctl -u h1-control -f

# Перезапуск сервиса
sudo systemctl restart h1-control

# Остановка сервиса
sudo systemctl stop h1-control

# Включение автозапуска
sudo systemctl enable h1-control

# Отключение автозапуска
sudo systemctl disable h1-control
``` 