#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функции для вывода сообщений
log() {
    echo -e "${GREEN}[H1 Stop]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[H1 Warning]${NC} $1"
}

error() {
    echo -e "${RED}[H1 Error]${NC} $1"
}

log "Остановка H1 сервисов..."

# Остановка системного сервиса
if systemctl is-active h1-control.service > /dev/null 2>&1; then
    log "Остановка системного сервиса..."
    systemctl stop h1-control.service || warn "Не удалось остановить системный сервис"
else
    warn "Системный сервис не запущен"
fi

# Остановка Docker контейнеров
if command -v docker &> /dev/null; then
    log "Остановка Docker контейнеров..."
    docker compose down 2>/dev/null || warn "Docker контейнеры не найдены"
    
    # Очистка неиспользуемых ресурсов
    log "Очистка Docker ресурсов..."
    docker system prune -f
else
    warn "Docker не установлен"
fi

# Остановка backend процесса
if [ -f "/home/unitree/backend.pid" ]; then
    BACKEND_PID=$(cat /home/unitree/backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        log "Остановка backend процесса (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        sleep 2
        kill -9 $BACKEND_PID 2>/dev/null || true
        rm -f /home/unitree/backend.pid
        log "Backend остановлен"
    else
        warn "Backend процесс не найден"
        rm -f /home/unitree/backend.pid
    fi
else
    warn "PID файл backend не найден"
fi

log "Все сервисы остановлены!"
echo -e "\n${YELLOW}Для запуска используйте:${NC}"
echo "sudo ./start_h1_unified.sh"
echo -e "\n${YELLOW}Для управления сервисом:${NC}"
echo "Статус:    sudo systemctl status h1-control"
echo "Логи:      sudo journalctl -u h1-control -f"
echo "Перезапуск: sudo systemctl restart h1-control" 