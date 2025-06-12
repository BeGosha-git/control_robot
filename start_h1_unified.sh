#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для вывода сообщений
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

info() {
    echo -e "${BLUE}[H1 Info]${NC} $1"
}

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
    error "Этот скрипт должен быть запущен с правами root (sudo)"
fi

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    info "Установка Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh || error "Не удалось установить Docker"
    rm get-docker.sh
fi

# Проверка наличия Docker Compose
if ! command -v docker compose &> /dev/null; then
    info "Установка Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose || error "Не удалось установить Docker Compose"
fi

# Проверка прав доступа к Docker
if ! docker info &> /dev/null; then
    error "Нет прав доступа к Docker. Убедитесь, что ваш пользователь входит в группу docker."
fi

# Функция для обновления проекта из git
update_from_git() {
    log "Обновление проекта из git..."
    
    # Проверяем и настраиваем правильный remote origin
    CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
    CORRECT_REMOTE="https://github.com/BeGosha-git/control_robot.git"
    
    if [ "$CURRENT_REMOTE" != "$CORRECT_REMOTE" ]; then
        info "Настройка правильного Git репозитория..."
        if [ -n "$CURRENT_REMOTE" ]; then
            git remote remove origin
        fi
        git remote add origin "$CORRECT_REMOTE" || error "Не удалось добавить remote origin"
    fi
    
    # Сохраняем configs.conf если он существует
    if [ -f "backend/configs.conf" ]; then
        info "Сохранение configs.conf..."
        cp backend/configs.conf /tmp/configs.conf.backup || warn "Не удалось сохранить configs.conf"
    fi
    
    # Получаем последние изменения
    git fetch origin || error "Не удалось получить изменения из репозитория"
    git reset --hard origin/main || error "Не удалось обновить локальные файлы"
    
    # Восстанавливаем configs.conf
    if [ -f "/tmp/configs.conf.backup" ]; then
        info "Восстановление configs.conf..."
        cp /tmp/configs.conf.backup backend/configs.conf || warn "Не удалось восстановить configs.conf"
        rm /tmp/configs.conf.backup
    fi
    
    # Обновляем права на файлы
    chown -R unitree:unitree . || warn "Не удалось обновить владельца файлов"
}

# Функция для проверки и установки Node.js
check_and_install_nodejs() {
    log "Проверка Node.js..."
    
    if ! command -v node &> /dev/null; then
        info "Установка Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash - || error "Не удалось добавить репозиторий Node.js"
        apt-get install -y nodejs || error "Не удалось установить Node.js"
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm не установлен. Пожалуйста, установите Node.js с npm"
    fi
    
    info "Node.js версия: $(node --version)"
    info "npm версия: $(npm --version)"
}

# Функция для установки зависимостей backend
install_backend_dependencies() {
    log "Установка зависимостей backend..."
    cd backend || error "Не удалось перейти в директорию backend"
    npm install || error "Не удалось установить зависимости backend"
    cd ..
}

# Функция для остановки существующих процессов
stop_existing_processes() {
    log "Остановка существующих процессов..."
    
    # Остановка Docker контейнеров
    docker compose down 2>/dev/null || true
    
    # Остановка backend процесса
    if [ -f "/home/unitree/backend.pid" ]; then
        BACKEND_PID=$(cat /home/unitree/backend.pid)
        if kill -0 $BACKEND_PID 2>/dev/null; then
            info "Остановка backend процесса (PID: $BACKEND_PID)..."
            kill $BACKEND_PID
            sleep 2
            kill -9 $BACKEND_PID 2>/dev/null || true
        fi
        rm -f /home/unitree/backend.pid
    fi
    
    # Очистка неиспользуемых Docker ресурсов
    log "Очистка неиспользуемых Docker ресурсов..."
    docker system prune -f
}

# Функция для запуска backend
start_backend() {
    log "Запуск backend..."
    cd backend || error "Не удалось перейти в директорию backend"
    
    # Запуск backend в фоне
    nohup node server.js > /home/unitree/backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /home/unitree/backend.pid
    
    # Ждем немного для запуска
    sleep 3
    
    # Проверяем, что процесс запущен
    if kill -0 $BACKEND_PID 2>/dev/null; then
        info "Backend запущен (PID: $BACKEND_PID)"
    else
        error "Не удалось запустить backend"
    fi
    
    cd ..
}

# Функция для запуска frontend в Docker
start_frontend() {
    log "Запуск frontend в Docker..."
    
    # Сборка и запуск контейнера
    if docker compose up -d --build; then
        info "Frontend контейнер запущен"
    else
        error "Ошибка при запуске frontend контейнера"
    fi
    
    # Ждем немного для запуска
    sleep 5
    
    # Проверяем статус контейнера
    if docker compose ps | grep -q "Up"; then
        info "Frontend контейнер работает"
    else
        error "Frontend контейнер не запущен"
    fi
}

# Функция для проверки доступности сервисов
check_services() {
    log "Проверка доступности сервисов..."
    
    # Проверка backend
    if curl -s http://localhost:3001/api/status > /dev/null 2>&1; then
        info "Backend API доступен"
    else
        warn "Backend API недоступен"
    fi
    
    # Проверка frontend
    if curl -s http://localhost > /dev/null 2>&1; then
        info "Frontend доступен"
    else
        warn "Frontend недоступен"
    fi
}

# Основная логика
main() {
    log "Запуск единого скрипта H1..."
    
    # Обновление из git
    update_from_git
    
    # Проверка и установка Node.js
    check_and_install_nodejs
    
    # Установка зависимостей backend
    install_backend_dependencies
    
    # Остановка существующих процессов
    stop_existing_processes
    
    # Создание необходимых директорий
    log "Создание необходимых директорий..."
    mkdir -p backend/test_files
    chmod 777 backend/test_files
    
    # Проверка доступа к камере
    if [ -e /dev/video0 ]; then
        log "Камера обнаружена"
        chmod 666 /dev/video0 || warn "Не удалось установить права на камеру"
    else
        warn "Камера не обнаружена (/dev/video0)"
    fi
    
    # Запуск backend
    start_backend
    
    # Запуск frontend
    start_frontend
    
    # Проверка сервисов
    check_services
    
    # Финальное сообщение
    log "Установка успешно завершена!"
    echo -e "\n${GREEN}Приложение доступно по адресам:${NC}"
    echo "Frontend: http://localhost"
    echo "Backend API: http://localhost:3001"
    echo -e "\n${YELLOW}Управление:${NC}"
    echo "Логи backend: tail -f /home/unitree/backend.log"
    echo "Логи frontend: docker compose logs -f"
    echo "Остановка: docker compose down && kill \$(cat /home/unitree/backend.pid)"
    echo "Перезапуск: sudo ./start_h1_unified.sh"
}

# Запуск основной функции
main 