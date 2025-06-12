#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для очистки временных файлов
cleanup_temp_files() {
    # Удаляем временные файлы backend
    rm -f /tmp/start_backend_*.sh 2>/dev/null || true
    rm -f /tmp/nvm_*.sh 2>/dev/null || true
    
    # Удаляем другие временные файлы
    rm -f /tmp/configs.conf.backup 2>/dev/null || true
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
    if [ "$(git remote get-url origin 2>/dev/null || echo "")" != "https://github.com/BeGosha-git/control_robot.git" ]; then
        info "Настройка правильного Git репозитория..."
        if [ -n "$(git remote get-url origin 2>/dev/null)" ]; then
            git remote remove origin
        fi
        git remote add origin "https://github.com/BeGosha-git/control_robot.git" || warn "Не удалось добавить remote origin"
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
        info "Обнаружен nvm. Проверка версий..."
        
        # Проверяем версии
        info "Node.js версия: $(sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && node --version" 2>/dev/null)"
        info "npm версия: $(sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && npm --version" 2>/dev/null)"
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

# Функция для проверки портов
check_ports() {
    log "Проверка портов..."
    
    # Проверяем порт 3001 (backend)
    if netstat -tuln 2>/dev/null | grep -q ":3001 "; then
        warn "Порт 3001 уже занят. Возможно, старый backend все еще работает."
    else
        info "Порт 3001 свободен"
    fi
    
    # Проверяем порт 80 (frontend)
    if netstat -tuln 2>/dev/null | grep -q ":80 "; then
        warn "Порт 80 уже занят. Возможно, старый frontend все еще работает."
    else
        info "Порт 80 свободен"
    fi
}

# Функция для остановки существующих процессов
stop_existing_processes() {
    log "Остановка существующих процессов..."
    
    # Остановка системного сервиса (если запущен)
    if systemctl is-active control_robot.service > /dev/null 2>&1; then
        info "Остановка системного сервиса..."
        systemctl stop control_robot.service || warn "Не удалось остановить системный сервис"
        sleep 2
    fi
    
    # Остановка Docker контейнеров
    docker compose down 2>/dev/null || true
    
    # Остановка всех backend процессов (более надежно)
    info "Остановка всех backend процессов..."
    
    # Останавливаем процессы по PID файлу
    if [ -f "/home/unitree/backend.pid" ]; then
        if kill -0 $(cat /home/unitree/backend.pid) 2>/dev/null; then
            info "Остановка backend процесса (PID: $(cat /home/unitree/backend.pid))..."
            kill $(cat /home/unitree/backend.pid)
            sleep 2
            kill -9 $(cat /home/unitree/backend.pid) 2>/dev/null || true
        fi
        rm -f /home/unitree/backend.pid
    fi
    
    # Останавливаем все процессы node server.js (на случай если PID файл устарел)
    PIDS=$(pgrep -f "node server.js" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        info "Остановка дополнительных backend процессов: $PIDS"
        echo "$PIDS" | xargs kill 2>/dev/null || true
        sleep 2
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
    fi
    
    # Очищаем временные файлы
    rm -f /tmp/start_backend.sh 2>/dev/null || true
    rm -f /tmp/nvm_*.sh 2>/dev/null || true
    
    # Ждем немного для полной остановки
    sleep 1
}

# Функция для запуска backend
start_backend() {
    log "Запуск backend..."
    cd backend || error "Не удалось перейти в директорию backend"
    
    # Проверяем, не запущен ли уже backend
    if [ -n "$(pgrep -f "node server.js" 2>/dev/null)" ]; then
        warn "Backend уже запущен. Остановка старого процесса..."
        pkill -f "node server.js" 2>/dev/null || true
        sleep 2
    fi
    
    # Запуск backend в фоне через nvm
    info "Запуск backend через nvm..."
    
    # Создаем временный скрипт для запуска с уникальным именем
    TEMP_SCRIPT="/tmp/start_backend_$$.sh"
    cat > "$TEMP_SCRIPT" << 'EOF'
#!/bin/bash
source /home/unitree/.nvm/nvm.sh
cd /home/unitree/control_robot/backend
exec node server.js > /home/unitree/backend.log 2>&1
EOF
    
    chmod +x "$TEMP_SCRIPT"
    
    # Запускаем через sudo -u unitree
    sudo -u unitree "$TEMP_SCRIPT" &
    BACKEND_PID=$!
    
    # Ждем немного для запуска
    sleep 3
    
    # Проверяем, что процесс запущен и получаем его PID
    if kill -0 $BACKEND_PID 2>/dev/null; then
        # Проверяем, что это действительно наш процесс node server.js
        if pgrep -f "node server.js" | grep -q "$BACKEND_PID"; then
            echo $BACKEND_PID > /home/unitree/backend.pid
            info "Backend запущен (PID: $BACKEND_PID)"
        else
            error "Процесс запущен, но не является node server.js"
        fi
    else
        error "Не удалось запустить backend"
    fi
    
    # Очищаем временный файл
    rm -f "$TEMP_SCRIPT"
    
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
    if [ ! -f "control_robot.service" ]; then
        warn "Файл сервиса control_robot.service не найден"
        return 0
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
}

# Функция для запуска системного сервиса
start_system_service() {
    log "Запуск системного сервиса..."
    
    if systemctl is-active control_robot.service > /dev/null 2>&1; then
        info "Системный сервис уже запущен"
    else
        info "Запуск системного сервиса..."
        systemctl start control_robot.service || error "Не удалось запустить системный сервис"
        
        # Ждем немного для запуска
        sleep 3
        
        # Проверяем статус
        if systemctl is-active control_robot.service > /dev/null 2>&1; then
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
    
    # Проверка портов
    check_ports
    
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
    
    # Установка системного сервиса
    install_system_service
    
    # Запуск системного сервиса
    start_system_service

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
    echo -e "\n${YELLOW}Управление приложением:${NC}"
    echo "Логи backend: tail -f /home/unitree/backend.log"
    echo "Логи frontend: docker compose logs -f"
    echo "Остановка: ./stop_h1.sh"
    echo "Перезапуск: sudo ./start_h1_unified.sh"
    echo -e "\n${YELLOW}Управление системным сервисом:${NC}"
    echo "Статус:    sudo systemctl status control_robot"
    echo "Логи:      sudo journalctl -u control_robot -f"
    echo "Перезапуск: sudo systemctl restart control_robot"
    echo "Остановка:  sudo systemctl stop control_robot"
    echo "Автозапуск: sudo systemctl enable control_robot"
    echo "Отключение: sudo systemctl disable control_robot"
}

# Запуск основной функции
main 