#!/bin/bash
########### BeRobot Router #################

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
log() {
    echo -e "${GREEN}[H1 Setup]${NC} $1"
}

error() {
    echo -e "${RED}[H1 Error]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[H1 Warning]${NC} $1"
}

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    error "Docker не установлен. Пожалуйста, установите Docker перед запуском."
fi

# Проверка наличия Docker Compose
if ! command -v docker compose &> /dev/null; then
    error "Docker Compose не установлен. Пожалуйста, установите Docker Compose перед запуском."
fi

# Проверка прав доступа к Docker
if ! docker info &> /dev/null; then
    error "Нет прав доступа к Docker. Убедитесь, что ваш пользователь входит в группу docker."
fi

# Создание необходимых директорий
log "Создание необходимых директорий..."
mkdir -p backend/test_files
chmod 777 backend/test_files

# Проверка наличия камеры
if [ -e /dev/video0 ]; then
    log "Камера обнаружена"
    # Проверка прав доступа к камере
    if [ ! -r /dev/video0 ]; then
        warn "Нет прав доступа к камере. Попытка исправить..."
        sudo chmod 666 /dev/video0 || warn "Не удалось установить права на камеру"
    fi
else
    warn "Камера не обнаружена (/dev/video0)"
fi

# Остановка существующих контейнеров
log "Остановка существующих контейнеров..."
docker compose down

# Очистка неиспользуемых образов и контейнеров
log "Очистка неиспользуемых Docker ресурсов..."
docker system prune -f

# Сборка и запуск контейнеров
log "Сборка и запуск контейнеров..."
if docker compose up -d; then
    log "Контейнеры успешно запущены"
else
    error "Ошибка при запуске контейнеров"
fi

# Проверка статуса контейнеров
log "Проверка статуса контейнеров..."
sleep 5 # Даем время на запуск

if docker compose ps | grep -q "Up"; then
    log "Все контейнеры запущены успешно"
    echo -e "\n${GREEN}Приложение доступно по адресам:${NC}"
    echo "Frontend: http://localhost"
    echo "Backend API: http://localhost/api"
    echo -e "\n${YELLOW}Для просмотра логов используйте:${NC}"
    echo "docker compose logs -f"
    echo -e "\n${YELLOW}Для остановки приложения используйте:${NC}"
    echo "docker compose down"
else
    error "Не все контейнеры запущены. Проверьте логи: docker compose logs"
fi

# Проверка доступности сервисов
log "Проверка доступности сервисов..."
if curl -s http://localhost > /dev/null; then
    log "Frontend доступен"
else
    warn "Frontend недоступен"
fi

if curl -s http://localhost/api/status > /dev/null; then
    log "Backend API доступен"
else
    warn "Backend API недоступен"
fi



