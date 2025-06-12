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

# Проверка прав и окружения
if [ "$EUID" -eq 0 ]; then
    # Запуск от root - все нормально
    RUNNING_AS_ROOT=true
    info "Запуск от root пользователя"
elif [ "$USER" = "unitree" ] && [ -n "$SYSTEMD_EXEC_PID" ]; then
    # Запуск от unitree через systemd - тоже нормально
    RUNNING_AS_ROOT=false
    info "Запуск от пользователя unitree через systemd"
else
    # Запуск от обычного пользователя без sudo
    error "Этот скрипт должен быть запущен с правами root (sudo) или через systemd"
fi

# Функция для установки прав на скрипты
fix_script_permissions() {
    info "Установка прав на скрипты..."
    
    # Устанавливаем права на выполнение
    chmod +x start_h1_unified.sh 2>/dev/null || warn "Не удалось установить права на start_h1_unified.sh"
    chmod +x stop_h1.sh 2>/dev/null || warn "Не удалось установить права на stop_h1.sh"
    chmod +x setup.sh 2>/dev/null || warn "Не удалось установить права на setup.sh"
    
    # Устанавливаем правильного владельца
    chown unitree:unitree *.sh 2>/dev/null || warn "Не удалось изменить владельца скриптов"
    
    info "Права на скрипты установлены"
}

# Функция для обновления Python зависимостей
update_python_dependencies() {
    log "Проверка и обновление Python зависимостей..."
    
    # Проверяем наличие виртуального окружения
    if [ -d "/home/unitree/control_robot/backend/src/services/.venv" ] && [ -f "/home/unitree/control_robot/backend/src/services/.venv/bin/activate" ]; then
        info "Виртуальное окружение найдено, обновляем зависимости..."
        
        cd /home/unitree/control_robot/backend/src/services || warn "Не удалось перейти в директорию services"
        
        # Активируем виртуальное окружение
        source /home/unitree/control_robot/backend/src/services/.venv/bin/activate || warn "Не удалось активировать виртуальное окружение"
        
        # Обновляем pip
        pip install --upgrade pip 2>/dev/null || warn "Не удалось обновить pip"
        
        # Обновляем зависимости
        if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt --upgrade || warn "Не удалось обновить зависимости"
        fi
        
        # Деактивируем виртуальное окружение
        deactivate
        
        cd /home/unitree/control_robot || warn "Не удалось вернуться в корневую директорию"
        
        info "Python зависимости обновлены"
    else
        warn "Виртуальное окружение не найдено или повреждено, создаем новое..."
        create_python_venv
    fi
}

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
        
        # После обновления из Git устанавливаем права на скрипты
        fix_script_permissions
        
        # Обновление Python зависимостей
        update_python_dependencies
    else
        warn "Не удалось получить обновления из репозитория"
    fi
    
    # Восстанавливаем configs.conf
    if [ -f "/tmp/configs.conf.backup" ]; then
        info "Восстановление configs.conf..."
        cp /tmp/configs.conf.backup backend/configs.conf || warn "Не удалось восстановить configs.conf"
        rm /tmp/configs.conf.backup
    fi
    
    # Обновляем права на файлы только если запущены от root
    if [ "$RUNNING_AS_ROOT" = true ]; then
        chown -R unitree:unitree . || warn "Не удалось обновить владельца файлов"
    fi
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
    
    # Остановка системного сервиса (если запущен) - только если НЕ запущены через systemd
    if [ -z "$SYSTEMD_EXEC_PID" ] && systemctl is-active control_robot.service > /dev/null 2>&1; then
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
set -e

# Настройка окружения
export NVM_DIR="/home/unitree/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Переходим в директорию backend
cd /home/unitree/control_robot/backend

# Проверяем наличие node_modules
if [ ! -d "node_modules" ]; then
    echo "node_modules не найден, устанавливаем зависимости..."
    npm install
fi

# Запускаем сервер
echo "Запуск Node.js сервера..."
exec node server.js > /home/unitree/backend.log 2>&1
EOF
    
    chmod +x "$TEMP_SCRIPT"
    
    # Запускаем через sudo -u unitree
    info "Запуск backend процесса..."
    sudo -u unitree "$TEMP_SCRIPT" &
    BACKEND_PID=$!
    
    # Ждем немного для запуска
    sleep 5
    
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
        # Проверяем логи для диагностики
        if [ -f "/home/unitree/backend.log" ]; then
            error "Не удалось запустить backend. Последние строки лога:"
            tail -10 /home/unitree/backend.log
        else
            error "Не удалось запустить backend. Лог-файл не создан."
        fi
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

# Функция для запуска системного сервиса
start_system_service() {
    log "Запуск системного сервиса..."
    
    # Если запущены через systemd, не пытаемся запустить сервис
    if [ -n "$SYSTEMD_EXEC_PID" ]; then
        info "Запущены через systemd, пропускаем запуск сервиса"
        return 0
    fi
    
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

# Функция для создания виртуального окружения Python
create_python_venv() {
    local venv_path="/home/unitree/control_robot/backend/src/services/.venv"
    
    log "Создание виртуального окружения Python..."
    
    # Проверка наличия python3-venv
    if ! python3 -c "import venv" 2>/dev/null; then
        error "python3-venv не установлен. Установка..."
        apt update || error "Не удалось обновить пакеты"
        apt install -y python3-venv || error "Не удалось установить python3-venv"
        info "python3-venv установлен"
    fi
    
    # Удаление старого виртуального окружения если существует
    if [ -d "$venv_path" ]; then
        log "Удаление старого виртуального окружения..."
        rm -rf "$venv_path"
    fi
    
    # Создание нового виртуального окружения
    if python3 -m venv "$venv_path"; then
        info "Виртуальное окружение создано успешно"
        
        # Установка зависимостей
        log "Установка Python зависимостей..."
        if "$venv_path/bin/pip" install -r "/home/unitree/control_robot/backend/requirements.txt"; then
            info "Python зависимости установлены"
        else
            error "Не удалось установить Python зависимости"
            return 1
        fi
    else
        error "Не удалось создать виртуальное окружение"
        return 1
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
    
    # Обновление Python зависимостей
    update_python_dependencies
    
    # Проверка портов
    check_ports
    
    # Остановка существующих процессов
    stop_existing_processes
    
    # Запуск системного сервиса
    start_system_service

    # Запуск backend
    start_backend
    
    # Запуск frontend
    start_frontend
    
    # Проверка сервисов
    check_services
    
    # Финальное сообщение
    log "Запуск успешно завершен!"
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