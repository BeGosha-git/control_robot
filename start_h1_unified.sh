#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для очистки временных файлов
cleanup_temp_files() {
    # Удаляем другие временные файлы nvm (если есть)
    rm -f /tmp/nvm_*.sh 2>/dev/null || true
}

# Устанавливаем trap для очистки при выходе
trap cleanup_temp_files EXIT

# Функция для проверки интернета
check_internet() {
    ping -c 1 8.8.8.8 > /dev/null 2>&1
}

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
    warn "Docker не установлен. Попытка установки..."
    
    # Проверяем доступность интернета
    if ! check_internet; then
        error "Docker не установлен и нет подключения к интернету для установки"
    fi
    
    info "Установка Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh || error "Не удалось установить Docker"
    rm get-docker.sh
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
fi

# Проверка прав доступа к Docker
if ! docker info &> /dev/null; then
    error "Нет прав доступа к Docker. Убедитесь, что ваш пользователь входит в группу docker."
fi

# Функция для обновления проекта из git
update_from_git() {
    log "Проверка обновлений из Git..."
    
    # Проверяем доступность интернета
    if ! check_internet; then
        warn "Нет подключения к интернету. Пропускаем обновление из Git."
        return 0
    fi
    
    # Проверяем и настраиваем правильный remote origin
    CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
    CORRECT_REMOTE="https://github.com/BeGosha-git/control_robot.git"
    
    if [ "$CURRENT_REMOTE" != "$CORRECT_REMOTE" ]; then
        info "Настройка правильного Git репозитория..."
        if [ -n "$CURRENT_REMOTE" ]; then
            git remote remove origin
        fi
        git remote add origin "$CORRECT_REMOTE" || warn "Не удалось добавить remote origin"
    fi
    
    # Сохраняем configs.conf если он существует
    if [ -f "backend/configs.conf" ]; then
        info "Сохранение configs.conf..."
        cp backend/configs.conf /tmp/configs.conf.backup || warn "Не удалось сохранить configs.conf"
    fi
    
    # Получаем последние изменения
    if git fetch origin; then
        info "Получены обновления из репозитория"
        git reset --hard origin/main || warn "Не удалось обновить локальные файлы"
    else
        warn "Не удалось получить обновления из репозитория"
    fi
    
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
    
    # Проверяем наличие nvm
    if [ -d "/home/unitree/.nvm" ] && [ -f "/home/unitree/.nvm/nvm.sh" ]; then
        info "Обнаружен nvm. Загрузка окружения..."
        
        # Проверяем активную версию node
        NVM_NODE_VERSION=$(sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && nvm current" 2>/dev/null)
        if [ -n "$NVM_NODE_VERSION" ] && [ "$NVM_NODE_VERSION" != "system" ]; then
            info "Активная версия nvm: $NVM_NODE_VERSION"
            
            # Используем прямые пути к nvm версиям
            NODE_CMD="sudo -u unitree /home/unitree/.nvm/versions/node/$NVM_NODE_VERSION/bin/node"
            NPM_CMD="sudo -u unitree /home/unitree/.nvm/versions/node/$NVM_NODE_VERSION/bin/npm"
            
            # Проверяем, что файлы существуют
            if [ -f "/home/unitree/.nvm/versions/node/$NVM_NODE_VERSION/bin/node" ] && [ -f "/home/unitree/.nvm/versions/node/$NVM_NODE_VERSION/bin/npm" ]; then
                # Проверяем версии
                NODE_VERSION=$($NODE_CMD --version 2>/dev/null)
                NPM_VERSION=$($NPM_CMD --version 2>/dev/null)
                
                if [ -n "$NODE_VERSION" ] && [ -n "$NPM_VERSION" ]; then
                    info "Node.js версия: $NODE_VERSION"
                    info "npm версия: $NPM_VERSION"
                    
                    # Экспортируем команды для использования в других функциях
                    export NPM_CMD="$NPM_CMD"
                    export NODE_CMD="$NODE_CMD"
                    return 0
                fi
            else
                warn "Файлы nvm не найдены по пути"
            fi
        else
            warn "nvm не имеет активной версии или использует system"
        fi
    fi
    
    # Если nvm не работает, проверяем стандартные установки
    NPM_FOUND=false
    
    # Способ 1: Прямая проверка в текущем окружении
    if command -v npm &> /dev/null; then
        NPM_FOUND=true
        NPM_CMD="npm"
    fi
    
    # Способ 2: Проверка через пользователя unitree
    if [ "$NPM_FOUND" = false ] && sudo -u unitree command -v npm &> /dev/null; then
        NPM_FOUND=true
        NPM_CMD="sudo -u unitree npm"
    fi
    
    # Способ 3: Проверка в стандартных путях
    if [ "$NPM_FOUND" = false ]; then
        for path in "/usr/bin/npm" "/usr/local/bin/npm" "/opt/nodejs/bin/npm"; do
            if [ -f "$path" ]; then
                NPM_FOUND=true
                NPM_CMD="$path"
                break
            fi
        done
    fi
    
    # Способ 4: Проверка через which в окружении unitree
    if [ "$NPM_FOUND" = false ]; then
        NPM_PATH=$(sudo -u unitree which npm 2>/dev/null)
        if [ -n "$NPM_PATH" ]; then
            NPM_FOUND=true
            NPM_CMD="sudo -u unitree npm"
        fi
    fi
    
    if [ "$NPM_FOUND" = false ]; then
        warn "npm не найден в стандартных местах. Попытка установки Node.js..."
        
        # Проверяем доступность интернета
        if ! check_internet; then
            error "npm не найден и нет подключения к интернету для установки Node.js"
        fi
        
        info "Установка Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash - || error "Не удалось добавить репозиторий Node.js"
        apt-get install -y nodejs || error "Не удалось установить Node.js"
        
        # После установки проверяем снова
        if command -v npm &> /dev/null; then
            NPM_FOUND=true
            NPM_CMD="npm"
        else
            error "npm не установлен. Пожалуйста, установите Node.js с npm"
        fi
    fi
    
    # Проверяем node аналогично
    NODE_FOUND=false
    
    if command -v node &> /dev/null; then
        NODE_FOUND=true
        NODE_CMD="node"
    elif sudo -u unitree command -v node &> /dev/null; then
        NODE_FOUND=true
        NODE_CMD="sudo -u unitree node"
    else
        for path in "/usr/bin/node" "/usr/local/bin/node" "/opt/nodejs/bin/node"; do
            if [ -f "$path" ]; then
                NODE_FOUND=true
                NODE_CMD="$path"
                break
            fi
        done
    fi
    
    if [ "$NODE_FOUND" = false ]; then
        error "Node.js не найден. Пожалуйста, установите Node.js"
    fi
    
    # Экспортируем команды для использования в других функциях
    export NPM_CMD="$NPM_CMD"
    export NODE_CMD="$NODE_CMD"
    
    info "Node.js версия: $($NODE_CMD --version)"
    info "npm версия: $($NPM_CMD --version)"
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
        
        # Используем найденную команду npm
        if [ -n "$NPM_CMD" ]; then
            # Если используется nvm (проверяем по пути)
            if [[ "$NPM_CMD" == *".nvm/versions/node"* ]]; then
                info "Установка зависимостей через nvm..."
                $NPM_CMD install || error "Не удалось установить зависимости backend"
            else
                info "Установка зависимостей через стандартный npm..."
                $NPM_CMD install || error "Не удалось установить зависимости backend"
            fi
        else
            error "Команда npm не найдена"
        fi
    else
        info "Зависимости backend уже установлены"
    fi
    
    cd ..
}

# Функция для остановки существующих процессов
stop_existing_processes() {
    log "Остановка существующих процессов..."
    
    # Остановка системного сервиса (если запущен)
    if systemctl is-active h1-control.service > /dev/null 2>&1; then
        info "Остановка системного сервиса..."
        systemctl stop h1-control.service || warn "Не удалось остановить системный сервис"
        sleep 2
    fi
    
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
}

# Функция для запуска backend
start_backend() {
    log "Запуск backend..."
    cd backend || error "Не удалось перейти в директорию backend"
    
    # Запуск backend в фоне с найденной командой node
    if [ -n "$NODE_CMD" ]; then
        # Если используется nvm (проверяем по пути)
        if [[ "$NODE_CMD" == *".nvm/versions/node"* ]]; then
            info "Запуск backend через nvm..."
            nohup $NODE_CMD server.js > /home/unitree/backend.log 2>&1 &
        else
            info "Запуск backend через стандартный node..."
            nohup $NODE_CMD server.js > /home/unitree/backend.log 2>&1 &
        fi
    else
        error "Команда node не найдена"
    fi
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
    
    # Проверяем наличие образа
    if docker images | grep -q "h1_site-frontend"; then
        info "Docker образ найден"
        
        # Проверяем, были ли обновления из Git (если есть интернет)
        if check_internet; then
            # Проверяем, есть ли изменения в frontend директории
            if git status --porcelain frontend/ | grep -q .; then
                info "Обнаружены изменения в frontend. Пересборка образа..."
                
                # Проверяем доступность интернета для загрузки образов
                if ! check_internet; then
                    warn "Нет интернета для пересборки. Запуск существующего образа..."
                    docker compose up -d || error "Ошибка при запуске frontend контейнера"
                else
                    # Пересборка с --build
                    if docker compose up -d --build; then
                        info "Frontend контейнер пересобран и запущен"
                    else
                        error "Ошибка при пересборке frontend контейнера"
                    fi
                fi
            else
                info "Изменений в frontend нет. Запуск существующего образа..."
                docker compose up -d || error "Ошибка при запуске frontend контейнера"
            fi
        else
            # Нет интернета - запускаем существующий образ
            info "Нет интернета. Запуск существующего образа..."
            docker compose up -d || error "Ошибка при запуске frontend контейнера"
        fi
    else
        warn "Docker образ не найден. Попытка сборки..."
        
        # Проверяем доступность интернета для загрузки образов
        if ! check_internet; then
            error "Docker образ не найден и нет подключения к интернету для загрузки базовых образов"
        fi
        
        # Сборка и запуск контейнера
        if docker compose up -d --build; then
            info "Frontend контейнер собран и запущен"
        else
            error "Ошибка при сборке и запуске frontend контейнера"
        fi
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

# Функция для установки системного сервиса
install_system_service() {
    log "Проверка системного сервиса..."
    
    # Проверяем наличие файла сервиса
    if [ ! -f "h1-control.service" ]; then
        warn "Файл сервиса h1-control.service не найден"
        return 0
    fi
    
    # Проверяем, установлен ли сервис
    if [ -f "/etc/systemd/system/h1-control.service" ]; then
        info "Системный сервис уже установлен"
        
        # Проверяем, включен ли автозапуск
        if systemctl is-enabled h1-control.service > /dev/null 2>&1; then
            info "Автозапуск сервиса уже включен"
        else
            info "Включение автозапуска сервиса..."
            systemctl enable h1-control.service || warn "Не удалось включить автозапуск сервиса"
        fi
    else
        info "Установка системного сервиса..."
        
        # Копируем файл сервиса
        cp h1-control.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
        chmod 644 /etc/systemd/system/h1-control.service || error "Не удалось установить права на файл сервиса"
        
        # Перезагружаем systemd
        systemctl daemon-reload || error "Не удалось перезагрузить systemd"
        
        # Включаем автозапуск
        systemctl enable h1-control.service || error "Не удалось включить сервис"
        
        info "Системный сервис установлен и включен"
    fi
    
    # Создание и настройка лог-файла
    if [ ! -f "/home/unitree/h1_control.log" ]; then
        info "Создание лог-файла..."
        touch /home/unitree/h1_control.log || error "Не удалось создать лог-файл"
        chown unitree:unitree /home/unitree/h1_control.log || error "Не удалось изменить владельца лог-файла"
        chmod 644 /home/unitree/h1_control.log || error "Не удалось установить права на лог-файл"
    fi
}

# Функция для запуска системного сервиса
start_system_service() {
    log "Запуск системного сервиса..."
    
    if systemctl is-active h1-control.service > /dev/null 2>&1; then
        info "Системный сервис уже запущен"
    else
        info "Запуск системного сервиса..."
        systemctl start h1-control.service || error "Не удалось запустить системный сервис"
        
        # Ждем немного для запуска
        sleep 3
        
        # Проверяем статус
        if systemctl is-active h1-control.service > /dev/null 2>&1; then
            info "Системный сервис успешно запущен"
        else
            error "Системный сервис не запустился"
        fi
    fi
}

# Основная логика
main() {
    log "Запуск единого скрипта H1..."
    
    # Настройка маршрутизации для робота H1
    log "Настройка маршрутизации для робота H1..."
    ip route add default via 192.168.123.1 2>/dev/null || warn "Маршрут уже существует или не удалось добавить"
    
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
    
    # Установка системного сервиса
    install_system_service
    
    # Запуск системного сервиса
    start_system_service
    
    # Финальное сообщение
    log "Установка успешно завершена!"
    echo -e "\n${GREEN}Приложение доступно по адресам:${NC}"
    echo "Frontend: http://localhost"
    echo "Backend API: http://localhost:3001"
    echo -e "\n${YELLOW}Управление приложением:${NC}"
    echo "Логи backend: tail -f /home/unitree/backend.log"
    echo "Логи frontend: docker compose logs -f"
    echo "Остановка: ./stop_h1.sh"
    echo "Перезапуск: sudo ./start_h1_unified.sh"
    echo -e "\n${YELLOW}Управление системным сервисом:${NC}"
    echo "Статус:    sudo systemctl status h1-control"
    echo "Логи:      sudo journalctl -u h1-control -f"
    echo "Перезапуск: sudo systemctl restart h1-control"
    echo "Остановка:  sudo systemctl stop h1-control"
    echo "Автозапуск: sudo systemctl enable h1-control"
    echo "Отключение: sudo systemctl disable h1-control"
}

# Запуск основной функции
main 