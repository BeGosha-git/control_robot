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

# Остановка системного сервиса (если запущен не через systemd)
if [ -z "$SYSTEMD_EXEC_PID" ] && systemctl is-active control_robot.service > /dev/null 2>&1; then
    log "Остановка системного сервиса..."
    systemctl stop control_robot.service || warn "Не удалось остановить системный сервис"
else
    warn "Системный сервис не запущен или запущен через systemd"
fi

# Остановка Docker контейнеров
if command -v docker &> /dev/null; then
    log "Остановка Docker контейнеров..."
    docker compose down 2>/dev/null || warn "Docker контейнеры не найдены"
else
    warn "Docker не установлен"
fi

# Остановка backend процесса
log "Остановка backend процессов..."

# Останавливаем процессы по PID файлу
if [ -f "/home/unitree/backend.pid" ]; then
    BACKEND_PID=$(cat /home/unitree/backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        log "Остановка backend процесса (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        sleep 3
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

# Останавливаем все процессы node server.js
PIDS=$(pgrep -f "node server.js" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    log "Остановка дополнительных backend процессов: $PIDS"
    echo "$PIDS" | xargs kill 2>/dev/null || true
    sleep 3
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
fi

# Очищаем временные файлы
rm -f /tmp/start_backend_*.sh 2>/dev/null || true
rm -f /tmp/nvm_*.sh 2>/dev/null || true

log "Все сервисы остановлены!"
echo -e "\n${YELLOW}Для запуска используйте:${NC}"
echo "sudo ./start_h1_unified.sh"
echo -e "\n${YELLOW}Для управления сервисом:${NC}"
echo "Статус:    sudo systemctl status control_robot"
echo "Логи:      sudo journalctl -u control_robot -f"
echo "Перезапуск: sudo systemctl restart control_robot" 