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

# Проверка прав
if [ "$EUID" -ne 0 ]; then
    error "Этот скрипт должен быть запущен с правами root (sudo)"
fi

# Функция для проверки интернета
check_internet() {
    ping -c 1 8.8.8.8 > /dev/null 2>&1
}

# Функция для проверки и установки Docker
check_and_install_docker() {
    log "Проверка Docker..."
    
    # Проверка наличия Docker
    if ! command -v docker &> /dev/null; then
        warn "Docker не установлен. Попытка установки..."
        
        # Проверяем доступность интернета
        if ! check_internet; then
            error "Docker не установлен и нет подключения к интернету для установки"
        fi
        
        info "Установка Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh || error "Не удалось установить Docker"
        rm get-docker.sh
    else
        info "Docker уже установлен"
    fi
    
    # Проверка наличия Docker Compose
    if ! command -v docker compose &> /dev/null; then
        warn "Docker Compose не установлен. Попытка установки..."
        
        # Проверяем доступность интернета
        if ! check_internet; then
            error "Docker Compose не установлен и нет подключения к интернету для установки"
        fi
        
        info "Установка Docker Compose..."
        curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose || error "Не удалось установить Docker Compose"
    else
        info "Docker Compose уже установлен"
    fi
    
    # Проверка прав доступа к Docker
    if ! docker info &> /dev/null; then
        error "Нет прав доступа к Docker. Убедитесь, что ваш пользователь входит в группу docker."
    fi
}

# Функция для проверки и установки Node.js
check_and_install_nodejs() {
    log "Проверка Node.js..."
    
    # Проверяем наличие nvm
    if [ -d "/home/unitree/.nvm" ] && [ -f "/home/unitree/.nvm/nvm.sh" ]; then
        info "Обнаружен nvm. Проверка версий..."
        
        NODE_VERSION=$(sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && node --version" 2>/dev/null)
        NPM_VERSION=$(sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && npm --version" 2>/dev/null)
        
        if [ -n "$NODE_VERSION" ] && [ -n "$NPM_VERSION" ]; then
            info "Node.js версия: $NODE_VERSION"
            info "npm версия: $NPM_VERSION"
        else
            error "Не удалось получить версии Node.js/npm"
        fi
    else
        error "nvm не найден. Пожалуйста, установите nvm"
    fi
}

# Функция для установки зависимостей backend
install_backend_dependencies() {
    log "Проверка зависимостей backend..."
    cd backend || error "Не удалось перейти в директорию backend"
    
    # Проверяем наличие node_modules
    if [ ! -d "node_modules" ]; then
        warn "node_modules не найден. Установка зависимостей..."
        
        # Проверяем доступность интернета
        if ! check_internet; then
            error "node_modules не найден и нет подключения к интернету для установки зависимостей"
        fi
        
        info "Установка зависимостей через nvm..."
        sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && npm install" || error "Не удалось установить зависимости backend"
    else
        info "Зависимости backend уже установлены"
    fi
    
    cd ..
}

# Функция для установки системного сервиса
install_system_service() {
    log "Установка системного сервиса..."
    
    # Проверяем наличие файла сервиса
    if [ ! -f "control_robot.service" ]; then
        error "Файл сервиса control_robot.service не найден"
    fi
    
    # Проверяем, установлен ли сервис
    if [ -f "/etc/systemd/system/control_robot.service" ]; then
        info "Системный сервис уже установлен"
        
        # Проверяем, есть ли изменения в файле сервиса
        if ! cmp -s "control_robot.service" "/etc/systemd/system/control_robot.service"; then
            info "Обнаружены изменения в файле сервиса. Обновление..."
            
            # Копируем новый файл сервиса
            cp control_robot.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
            chmod 644 /etc/systemd/system/control_robot.service || error "Не удалось установить права на файл сервиса"
            
            # Перезагружаем systemd
            systemctl daemon-reload || error "Не удалось перезагрузить systemd"
            
            # Перезапускаем сервис если он запущен
            if systemctl is-active control_robot.service > /dev/null 2>&1; then
                info "Перезапуск сервиса..."
                systemctl restart control_robot.service || warn "Не удалось перезапустить сервис"
            fi
            
            info "Сервис обновлен"
        else
            info "Изменений в файле сервиса нет"
        fi
        
        # Проверяем, включен ли автозапуск
        if systemctl is-enabled control_robot.service > /dev/null 2>&1; then
            info "Автозапуск сервиса уже включен"
        else
            info "Включение автозапуска сервиса..."
            systemctl enable control_robot.service || warn "Не удалось включить автозапуск сервиса"
        fi
    else
        info "Установка системного сервиса..."
        
        # Копируем файл сервиса
        cp control_robot.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
        chmod 644 /etc/systemd/system/control_robot.service || error "Не удалось установить права на файл сервиса"
        
        # Перезагружаем systemd
        systemctl daemon-reload || error "Не удалось перезагрузить systemd"
        
        # Включаем автозапуск
        systemctl enable control_robot.service || error "Не удалось включить сервис"
        
        info "Системный сервис установлен и включен"
    fi
    
    # Создание и настройка лог-файла
    if [ ! -f "/home/unitree/control_robot.log" ]; then
        info "Создание лог-файла..."
        touch /home/unitree/control_robot.log || error "Не удалось создать лог-файл"
        chown unitree:unitree /home/unitree/control_robot.log || error "Не удалось изменить владельца лог-файла"
        chmod 644 /home/unitree/control_robot.log || error "Не удалось установить права на лог-файл"
    fi
    
    # Проверяем права на скрипты
    info "Проверка прав на скрипты..."
    chmod +x /home/unitree/control_robot/start_h1_unified.sh || warn "Не удалось установить права на start_h1_unified.sh"
    chmod +x /home/unitree/control_robot/stop_h1.sh || warn "Не удалось установить права на stop_h1.sh"
    chmod +x /home/unitree/control_robot/setup.sh || warn "Не удалось установить права на setup.sh"
}

# Функция для создания необходимых директорий и настройки прав
setup_directories_and_permissions() {
    log "Настройка директорий и прав доступа..."
    
    # Создание необходимых директорий
    mkdir -p backend/test_files
    chmod 777 backend/test_files
    
    # Проверка доступа к камере
    if [ -e /dev/video0 ]; then
        log "Камера обнаружена"
        chmod 666 /dev/video0 || warn "Не удалось установить права на камеру"
    else
        warn "Камера не обнаружена (/dev/video0)"
    fi
}

# Основная логика
main() {
    log "Установка и настройка системы H1..."
    
    # Проверка и установка Docker
    check_and_install_docker
    
    # Проверка и установка Node.js
    check_and_install_nodejs
    
    # Установка зависимостей backend
    install_backend_dependencies
    
    # Настройка директорий и прав
    setup_directories_and_permissions
    
    # Установка системного сервиса
    install_system_service
    
    # Финальное сообщение
    log "Установка системы завершена!"
    echo -e "\n${GREEN}Система установлена и настроена!${NC}"
    echo -e "\n${YELLOW}Управление системным сервисом:${NC}"
    echo "Запуск:    sudo systemctl start control_robot"
    echo "Статус:    sudo systemctl status control_robot"
    echo "Логи:      sudo journalctl -u control_robot -f"
    echo "Перезапуск: sudo systemctl restart control_robot"
    echo "Остановка:  sudo systemctl stop control_robot"
    echo "Автозапуск: sudo systemctl enable control_robot"
    echo "Отключение: sudo systemctl disable control_robot"
    echo -e "\n${YELLOW}Для запуска приложения используйте:${NC}"
    echo "sudo ./start_h1_unified.sh"
}

# Запуск основной функции
main 