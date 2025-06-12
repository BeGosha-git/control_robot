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

# Функция для проверки Docker
check_docker() {
    log "Проверка Docker..."
    
    # Проверка наличия Docker
    if command -v docker &> /dev/null; then
        info "Docker установлен"
    else
        error "Docker не установлен. Пожалуйста, установите Docker вручную"
    fi
    
    # Проверка наличия Docker Compose
    if command -v docker compose &> /dev/null; then
        info "Docker Compose установлен"
    else
        error "Docker Compose не установлен. Пожалуйста, установите Docker Compose вручную"
    fi
    
    # Проверка прав доступа к Docker
    if docker info &> /dev/null; then
        info "Docker доступен"
    else
        error "Нет прав доступа к Docker. Убедитесь, что ваш пользователь входит в группу docker"
    fi
}

# Функция для проверки Python3
check_python3() {
    log "Проверка Python3..."
    
    # Проверка наличия Python3
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version 2>/dev/null)
        info "Python3 установлен: $PYTHON_VERSION"
    else
        error "Python3 не установлен. Пожалуйста, установите Python3 вручную"
    fi
    
    # Проверка наличия pip3
    if command -v pip3 &> /dev/null; then
        info "pip3 установлен"
    else
        error "pip3 не установлен. Пожалуйста, установите pip3 вручную"
    fi
    
    # Проверка наличия python3-venv
    if ! dpkg -l | grep -q python3-venv; then
        warn "python3-venv не установлен. Установка..."
        
        # Временно отключаем проблемные репозитории
        if [ -f "/etc/apt/sources.list.d/ros-latest.list" ]; then
            mv /etc/apt/sources.list.d/ros-latest.list /etc/apt/sources.list.d/ros-latest.list.disabled 2>/dev/null || true
        fi
        if [ -f "/etc/apt/sources.list.d/ros2.list" ]; then
            mv /etc/apt/sources.list.d/ros2.list /etc/apt/sources.list.d/ros2.list.disabled 2>/dev/null || true
        fi
        
        # Пробуем обновить пакеты
        apt update 2>/dev/null || warn "Не удалось обновить пакеты, продолжаем установку"
        
        # Устанавливаем python3-venv
        apt install -y python3-venv || error "Не удалось установить python3-venv"
        
        # Восстанавливаем репозитории
        if [ -f "/etc/apt/sources.list.d/ros-latest.list.disabled" ]; then
            mv /etc/apt/sources.list.d/ros-latest.list.disabled /etc/apt/sources.list.d/ros-latest.list 2>/dev/null || true
        fi
        if [ -f "/etc/apt/sources.list.d/ros2.list.disabled" ]; then
            mv /etc/apt/sources.list.d/ros2.list.disabled /etc/apt/sources.list.d/ros2.list 2>/dev/null || true
        fi
        
        info "python3-venv установлен"
    else
        info "python3-venv уже установлен"
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
    
    # Устанавливаем права на все скрипты
    if [ -f "/home/unitree/control_robot/start_h1_unified.sh" ]; then
        chmod +x /home/unitree/control_robot/start_h1_unified.sh || warn "Не удалось установить права на start_h1_unified.sh"
        info "Права на start_h1_unified.sh установлены"
    else
        warn "Файл start_h1_unified.sh не найден"
    fi
    
    if [ -f "/home/unitree/control_robot/stop_h1.sh" ]; then
        chmod +x /home/unitree/control_robot/stop_h1.sh || warn "Не удалось установить права на stop_h1.sh"
        info "Права на stop_h1.sh установлены"
    else
        warn "Файл stop_h1.sh не найден"
    fi
    
    if [ -f "/home/unitree/control_robot/setup.sh" ]; then
        chmod +x /home/unitree/control_robot/setup.sh || warn "Не удалось установить права на setup.sh"
        info "Права на setup.sh установлены"
    else
        warn "Файл setup.sh не найден"
    fi
    
    # Устанавливаем владельца на скрипты
    chown unitree:unitree /home/unitree/control_robot/*.sh 2>/dev/null || warn "Не удалось изменить владельца скриптов"
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

# Функция для установки Python зависимостей
install_python_dependencies() {
    log "Установка Python зависимостей..."
    
    # Проверка и установка python3-venv
    if ! dpkg -l | grep -q python3-venv; then
        warn "python3-venv не установлен. Установка..."
        
        # Пробуем обновить пакеты
        apt update 2>/dev/null || warn "Не удалось обновить пакеты, продолжаем установку"
        
        # Устанавливаем python3-venv
        apt install -y python3-venv || error "Не удалось установить python3-venv"
        
        info "python3-venv установлен"
    else
        info "python3-venv уже установлен"
    fi
    
    # Удаляем старое виртуальное окружение если есть
    if [ -d "/home/unitree/control_robot/backend/src/services/.venv" ]; then
        info "Удаление старого виртуального окружения..."
        # Сначала меняем права, чтобы можно было удалить
        chown -R unitree:unitree /home/unitree/control_robot/backend/src/services/.venv 2>/dev/null || true
        rm -rf /home/unitree/control_robot/backend/src/services/.venv
    fi
    
    # Создаем новое виртуальное окружение
    info "Создание виртуального окружения..."
    if python3 -m venv /home/unitree/control_robot/backend/src/services/.venv; then
        info "Виртуальное окружение создано успешно"
        
        # Сразу меняем права на виртуальное окружение
        chown -R unitree:unitree /home/unitree/control_robot/backend/src/services/.venv || error "Не удалось изменить права на виртуальное окружение"
        
        # Активируем виртуальное окружение и устанавливаем зависимости
        info "Активация виртуального окружения и установка зависимостей..."
        source /home/unitree/control_robot/backend/src/services/.venv/bin/activate || error "Не удалось активировать виртуальное окружение"
        
        # Обновляем pip
        pip install --upgrade pip || warn "Не удалось обновить pip"
        
        # Проверяем наличие requirements.txt в services директории
        if [ -f "/home/unitree/control_robot/backend/src/services/requirements.txt" ]; then
            info "Найден requirements.txt в services, устанавливаем зависимости..."
            pip install -r /home/unitree/control_robot/backend/src/services/requirements.txt || warn "Не удалось установить зависимости из requirements.txt"
        elif [ -f "/home/unitree/control_robot/backend/requirements.txt" ]; then
            info "Найден requirements.txt в backend, устанавливаем зависимости..."
            pip install -r /home/unitree/control_robot/backend/requirements.txt || warn "Не удалось установить зависимости из requirements.txt"
        else
            # Устанавливаем основные зависимости для camera_service.py
            info "Установка основных Python зависимостей..."
            pip install flask flask-cors opencv-python numpy || warn "Не удалось установить некоторые Python зависимости"
        fi
        
        # Деактивируем виртуальное окружение
        deactivate
        
        info "Python зависимости установлены в виртуальном окружении"
    else
        error "Не удалось создать виртуальное окружение. Проверьте установку python3-venv"
    fi
}

# Основная логика
main() {
    log "Установка и настройка системы H1..."
    
    # Проверка и установка Docker
    check_docker
    
    # Проверка и установка Python3
    check_python3
    
    # Проверка и установка Node.js
    check_and_install_nodejs
    
    # Установка зависимостей backend
    install_backend_dependencies
    
    # Установка Python зависимостей
    install_python_dependencies
    
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