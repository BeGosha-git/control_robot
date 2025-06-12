# H1 Robot Control - Единый скрипт запуска

## Описание

Этот проект использует гибридную архитектуру:
- **Backend**: Запускается напрямую на хосте с Node.js
- **Frontend**: Запускается в Docker контейнере с nginx

**Git репозиторий**: [https://github.com/BeGosha-git/control_robot](https://github.com/BeGosha-git/control_robot)

## Быстрый запуск

```bash
sudo ./start_h1_unified.sh
```

## Что делает единый скрипт

1. **Обновление из Git**: Получает последние изменения из репозитория [control_robot](https://github.com/BeGosha-git/control_robot), сохраняя `configs.conf`
2. **Проверка зависимостей**: Устанавливает Docker, Docker Compose и Node.js если необходимо
3. **Установка зависимостей**: Устанавливает npm пакеты для backend
4. **Остановка процессов**: Останавливает все существующие процессы и контейнеры
5. **Запуск backend**: Запускает Node.js сервер в фоне
6. **Запуск frontend**: Собирает и запускает Docker контейнер с фронтендом
7. **Проверка**: Проверяет доступность всех сервисов

## Архитектура

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │
│   (Docker)      │    │   (Node.js)     │
│   Port: 80      │◄──►│   Port: 3001    │
│   npm в конт.   │    │   npm на хосте  │
└─────────────────┘    └─────────────────┘
```

**Frontend**: Собирается в Docker контейнере, npm зависимости не нужны на хосте  
**Backend**: Работает напрямую на хосте, требует npm зависимости

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
```

### Перезапуск
```bash
sudo ./start_h1_unified.sh
```

## Доступ к приложению

- **Frontend**: http://localhost
- **Backend API**: http://localhost:3001

## Требования

- Linux система
- Права root (sudo)
- Интернет соединение для загрузки зависимостей
- Git репозиторий: https://github.com/BeGosha-git/control_robot

## Структура файлов

```
h1_site/
├── start_h1_unified.sh    # Единый скрипт запуска
├── stop_h1.sh             # Скрипт остановки
├── docker-compose.yml     # Конфигурация Docker
├── backend/
│   ├── server.js          # Backend сервер
│   ├── configs.conf       # Конфигурация (сохраняется при обновлении)
│   └── package.json       # Зависимости backend
├── frontend/
│   ├── Dockerfile         # Docker образ для фронтенда
│   ├── nginx.conf         # Конфигурация nginx
│   └── package.json       # Зависимости frontend
└── README_UNIFIED.md      # Эта документация
```

## Особенности

- **Сохранение конфигурации**: `configs.conf` не перезаписывается при обновлении
- **Автоматическая установка**: Все зависимости устанавливаются автоматически
- **Гибридная архитектура**: Backend на хосте, frontend в контейнере
- **Мониторинг**: Автоматическая проверка доступности сервисов
- **Логирование**: Отдельные логи для backend и frontend
- **Простое управление**: Один скрипт для запуска, один для остановки
- **Автоматическая настройка Git**: Скрипт автоматически настраивает правильный remote origin
- **Работа без интернета**: Скрипт проверяет наличие зависимостей и работает офлайн, если все необходимое уже установлено
- **Умная сборка Docker**: Frontend пересобирается только при наличии изменений и интернета

## Режимы работы

### С интернетом
- Обновляет проект из Git репозитория
- Устанавливает недостающие зависимости для backend
- Пересобирает Docker образ frontend только при изменениях
- Собирает Docker образы при необходимости

### Без интернета (офлайн режим)
- Пропускает обновление из Git
- Использует уже установленные зависимости backend
- Запускает существующие Docker образы без пересборки
- Работает только если все зависимости уже установлены

## Устранение неполадок

### Docker не запускается
```bash
sudo systemctl start docker
sudo usermod -aG docker $USER
```

### Порт 80 занят
```bash
sudo netstat -tulpn | grep :80
sudo kill -9 <PID>
```

### Backend не запускается
```bash
cd backend
npm install
node server.js
```

### Frontend контейнер не собирается
```bash
cd frontend
docker build -t h1-frontend .
```

### Проблемы с Git репозиторием
```bash
# Проверка текущего remote
git remote -v

# Настройка правильного репозитория
git remote set-url origin https://github.com/BeGosha-git/control_robot.git

# Принудительное обновление
git fetch origin
git reset --hard origin/main
```

### Принудительная остановка всех процессов
```bash
# Остановка Docker контейнеров
docker compose down

# Поиск и остановка Node.js процессов
pkill -f "node server.js"

# Очистка PID файлов
rm -f /home/unitree/backend.pid
``` 