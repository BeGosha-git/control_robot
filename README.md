# H1 Camera System v2.0

Оптимизированная система стриминга камер с архитектурой:
- **Frontend**: React с автоматическим восстановлением MJPEG стримов (Docker)
- **Backend**: Node.js прокси + Python FastAPI сервис камер
- **Service Manager**: Автоматическое управление жизненным циклом сервисов

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
# Backend зависимости
cd backend
npm run install-deps

# Frontend (Docker)
cd ../frontend
docker-compose up --build
```

### 2. Запуск системы

#### Backend (Node.js + Python)
```bash
# Запуск Node.js сервера (прокси + файловый менеджер)
cd backend
npm start

# В отдельном терминале - запуск Python сервиса камер
cd backend
python src/services/camera_service.py
```

#### Frontend (Docker Compose)
```bash
# Запуск React frontend в Docker
cd frontend
docker-compose up --build

# Или в фоновом режиме
docker-compose up -d --build
```

## 🏗️ Архитектура

### Frontend (React + Docker)
- **Автоматическое восстановление MJPEG стримов** при ошибках
- **React Query** для кэширования API запросов
- **Адаптивный UI** с skeleton-загрузками и анимациями
- **Статус-индикаторы** для каждой камеры
- **Docker контейнер** для изолированного запуска

### Backend (Node.js)
- **Универсальный прокси** для всех запросов к Python сервису
- **Оптимизированная обработка MJPEG** стримов
- **Улучшенная обработка ошибок** с детальным логированием
- **Файловый менеджер** для управления файлами

### Python Service (FastAPI)
- **FastAPI** вместо Flask для лучшей производительности
- **Очереди кадров** для стабильного MJPEG стриминга
- **Прямая отдача JPEG** без base64 кодирования
- **Типизация** с Pydantic моделями
- **Health check** эндпоинт для мониторинга

### Service Manager
- **Автоматический мониторинг** сервисов
- **Перезапуск при сбоях** с лимитом попыток
- **Логирование** всех событий
- **Health check** для Node.js сервера

## 📡 API Endpoints

### Python Service (порт 5000)
```
GET  /health                    - Health check
GET  /api/status               - Статус сервиса
GET  /api/cameras              - Список камер
POST /api/cameras/start-all    - Запуск всех камер
POST /api/cameras/stop-all     - Остановка всех камер
GET  /api/cameras/{id}/mjpeg   - MJPEG стрим камеры
POST /api/cameras/{id}/start   - Запуск камеры
POST /api/cameras/{id}/stop    - Остановка камеры
```

### Node.js Proxy (порт 3001)
```
GET  /api/status               - Статус системы
GET  /api/cameras/*            - Прокси к Python сервису
POST /api/fs/*                - Файловый менеджер
```

## 🔧 Конфигурация

### Переменные окружения
```bash
# Node.js сервер
NODE_SERVER_URL=http://localhost:3001  # URL для Service Manager

# Python сервис
CAMERA_FRAME_RATE=30                   # FPS для камер
CAMERA_RESOLUTION=640x480              # Разрешение камер
```

### Конфигурационный файл
`backend/configs.conf` - настройки робота и путей

## 🚨 Устранение неполадок

### Камеры не отображаются
1. Проверьте, что камеры подключены к системе
2. Убедитесь, что Python сервис запущен: `http://localhost:5000/health`
3. Проверьте логи Python сервиса на ошибки OpenCV

### MJPEG стрим не работает
1. Проверьте CORS настройки в браузере
2. Убедитесь, что камера активна
3. Проверьте логи Node.js прокси

### Frontend не собирается в Docker
1. Проверьте, что все зависимости установлены
2. Убедитесь, что Docker и Docker Compose установлены
3. Проверьте логи сборки: `docker-compose logs frontend`

### Service Manager не запускает сервисы
1. Проверьте доступность Node.js сервера
2. Убедитесь, что Python зависимости установлены
3. Проверьте файл `service_manager.log`

## 📊 Мониторинг

### Логи
- **Node.js**: Консоль + файл логов
- **Python**: Консоль + структурированные логи
- **Service Manager**: `service_manager.log`
- **Frontend**: `docker-compose logs frontend`

### Health Checks
- **Python Service**: `http://localhost:5000/health`
- **Node.js Server**: `http://localhost:3001/api/status`
- **Frontend**: `http://localhost:3000`

## 🔄 Обновления

### v2.0 Основные улучшения
- ✅ FastAPI вместо Flask
- ✅ Оптимизированный MJPEG стриминг
- ✅ Автоматическое восстановление стримов
- ✅ Улучшенная обработка ошибок
- ✅ Типизация и валидация данных
- ✅ Асинхронная обработка запросов
- ✅ Очереди кадров для стабильности
- ✅ Health check эндпоинты
- ✅ Детальное логирование
- ✅ Docker Compose для фронтенда

## 📝 Лицензия

MIT License - см. файл LICENSE 