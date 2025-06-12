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
        info "Виртуальное окружение найдено, проверяем зависимости..."
        
        # Проверяем права на виртуальное окружение
        if [ ! -r "/home/unitree/control_robot/backend/src/services/.venv/bin/activate" ]; then
            warn "Нет прав на чтение виртуального окружения, исправляем права..."
            chown -R unitree:unitree /home/unitree/control_robot/backend/src/services/.venv 2>/dev/null || true
            chmod -R 755 /home/unitree/control_robot/backend/src/services/.venv 2>/dev/null || true
        fi
        
        # Выполняем проверку и обновление зависимостей от unitree
        sudo -u unitree bash -c "
            cd /home/unitree/control_robot/backend/src/services
            
            # Активируем виртуальное окружение
            source /home/unitree/control_robot/backend/src/services/.venv/bin/activate || exit 1
            
            # Проверяем, что виртуальное окружение действительно активировано
            if [ -z \"\$VIRTUAL_ENV\" ]; then
                echo 'Виртуальное окружение не активировано'
                exit 1
            fi
            
            echo 'Виртуальное окружение активировано: '\$VIRTUAL_ENV
            
            # Быстрая проверка основных зависимостей без обновления
            if ! python -c 'import flask, flask_cors, cv2, numpy' 2>/dev/null; then
                echo 'Не все зависимости установлены, устанавливаем...'
                
                # Обновляем pip только если нужно
                pip install --upgrade pip --timeout 15 --retries 5 2>/dev/null || echo 'Не удалось обновить pip'
                
                # Устанавливаем зависимости без обновления (быстрее)
                if [ -f '/home/unitree/control_robot/backend/requirements.txt' ]; then
                    pip install -r /home/unitree/control_robot/backend/requirements.txt --timeout 15 --retries 5 || {
                        echo 'Не удалось установить зависимости с фиксированными версиями, пробуем без версий...'
                        pip install flask flask-cors opencv-python numpy --timeout 15 --retries 5 || echo 'Не удалось установить зависимости'
                    }
                else
                    # Устанавливаем основные зависимости для camera_service.py
                    echo 'Установка основных Python зависимостей...'
                    pip install flask flask-cors opencv-python numpy --timeout 15 --retries 5 || echo 'Не удалось установить некоторые Python зависимости'
                fi
            else
                echo 'Все основные зависимости уже установлены'
            fi
            
            # Деактивируем виртуальное окружение
            deactivate
            
            cd /home/unitree/control_robot
        " || {
            warn "Не удалось активировать виртуальное окружение, создаем новое..."
            create_python_venv
            return
        }
        
        info "Python зависимости проверены"
    else
        warn "Виртуальное окружение не найдено или повреждено, создаем новое..."
        create_python_venv
    fi
}

# Функция для обновления проекта из git
update_from_git() {
    log "Проверка обновлений из Git..."
    
    # Обновление из git только если НЕ запущены через systemd
    if [ -z "$SYSTEMD_EXEC_PID" ]; then
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
    else
        info "Запуск через systemd, пропускаем обновление из Git"
    fi
}

# Функция для проверки портов
check_ports() {
    log "Проверка портов..."
    
    # Проверяем порт 3001 (backend)
    if ss -tuln 2>/dev/null | grep -q ":3001 "; then
        warn "Порт 3001 уже занят. Возможно, старый backend все еще работает."
    else
        info "Порт 3001 свободен"
    fi
    
    # Проверяем порт 80 (frontend)
    if ss -tuln 2>/dev/null | grep -q ":80 "; then
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
        if sudo -u unitree kill -0 $(cat /home/unitree/backend.pid) 2>/dev/null; then
            info "Остановка backend процесса (PID: $(cat /home/unitree/backend.pid))..."
            sudo -u unitree kill $(cat /home/unitree/backend.pid)
            sleep 2
            sudo -u unitree kill -9 $(cat /home/unitree/backend.pid) 2>/dev/null || true
        fi
        rm -f /home/unitree/backend.pid
    fi
    
    # Останавливаем все процессы node server.js (на случай если PID файл устарел)
    PIDS=$(sudo -u unitree pgrep -f "node server.js" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        info "Остановка дополнительных backend процессов: $PIDS"
        echo "$PIDS" | xargs -r sudo -u unitree kill 2>/dev/null || true
        sleep 2
        echo "$PIDS" | xargs -r sudo -u unitree kill -9 2>/dev/null || true
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
    if [ -n "$(sudo -u unitree pgrep -f "node server.js" 2>/dev/null)" ]; then
        warn "Backend уже запущен. Остановка старого процесса..."
        sudo -u unitree pkill -f "node server.js" 2>/dev/null || true
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
        if sudo -u unitree pgrep -f "node server.js" | grep -q "$BACKEND_PID"; then
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
        
        # Проверяем, были ли обновления из Git (если есть интернет и НЕ запущены через systemd)
        if check_internet && [ -z "$SYSTEMD_EXEC_PID" ]; then
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
            # Нет интернета или запуск через systemd - запускаем существующий образ
            if [ -n "$SYSTEMD_EXEC_PID" ]; then
                info "Запуск через systemd. Запуск существующего образа..."
            else
                info "Нет интернета. Запуск существующего образа..."
            fi
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
    log "Создание виртуального окружения Python..."
    
    # Проверяем, не существует ли уже виртуальное окружение
    if [ -d "/home/unitree/control_robot/backend/src/services/.venv" ] && [ -f "/home/unitree/control_robot/backend/src/services/.venv/bin/activate" ]; then
        info "Виртуальное окружение уже существует, пропускаем создание"
        return 0
    fi
    
    # Удаляем старое виртуальное окружение если есть
    if [ -d "/home/unitree/control_robot/backend/src/services/.venv" ]; then
        info "Удаление старого виртуального окружения..."
        # Сначала меняем права, чтобы можно было удалить
        chown -R unitree:unitree /home/unitree/control_robot/backend/src/services/.venv 2>/dev/null || true
        rm -rf /home/unitree/control_robot/backend/src/services/.venv
    fi
    
    # Создаем директорию services если её нет
    mkdir -p /home/unitree/control_robot/backend/src/services || error "Не удалось создать директорию services"
    
    # Создаем новое виртуальное окружение
    info "Создание виртуального окружения..."
    if python3 -m venv /home/unitree/control_robot/backend/src/services/.venv; then
        info "Виртуальное окружение создано успешно"
        
        # Сразу меняем права на виртуальное окружение
        chown -R unitree:unitree /home/unitree/control_robot/backend/src/services/.venv || error "Не удалось изменить права на виртуальное окружение"
        chmod -R 755 /home/unitree/control_robot/backend/src/services/.venv || error "Не удалось установить права на виртуальное окружение"
        
        # Активируем виртуальное окружение и устанавливаем зависимости от unitree
        info "Активация виртуального окружения и установка зависимостей..."
        sudo -u unitree bash -c "
            cd /home/unitree/control_robot/backend/src/services
            source /home/unitree/control_robot/backend/src/services/.venv/bin/activate || exit 1
            
            # Проверяем, что виртуальное окружение действительно активировано
            if [ -z \"\$VIRTUAL_ENV\" ]; then
                echo 'Виртуальное окружение не активировано после source activate'
                exit 1
            fi
            
            echo 'Виртуальное окружение активировано: '\$VIRTUAL_ENV
            
            # Обновляем pip только если нужно
            pip install --upgrade pip --timeout 15 --retries 5 2>/dev/null || echo 'Не удалось обновить pip'
            
            # Устанавливаем зависимости без обновления (быстрее)
            if [ -f '/home/unitree/control_robot/backend/requirements.txt' ]; then
                pip install -r /home/unitree/control_robot/backend/requirements.txt --timeout 15 --retries 5 || {
                    echo 'Не удалось установить зависимости с фиксированными версиями, пробуем без версий...'
                    pip install flask flask-cors opencv-python numpy --timeout 15 --retries 5 || echo 'Не удалось установить зависимости'
                }
            else
                # Устанавливаем основные зависимости для camera_service.py
                echo 'Установка основных Python зависимостей...'
                pip install flask flask-cors opencv-python numpy --timeout 15 --retries 5 || echo 'Не удалось установить некоторые Python зависимости'
            fi
            
            # Проверяем установку зависимостей
            if python -c 'import flask, flask_cors, cv2, numpy' 2>/dev/null; then
                echo 'Все основные зависимости успешно установлены'
            else
                echo 'Не все зависимости установлены корректно'
            fi
            
            # Деактивируем виртуальное окружение
            deactivate
            
            cd /home/unitree/control_robot
        " || error "Не удалось активировать виртуальное окружение или установить зависимости"
        
        info "Виртуальное окружение создано и зависимости установлены"
    else
        error "Не удалось создать виртуальное окружение. Проверьте установку python3-venv"
    fi
}

# Основная логика
main() {
    log "Запуск единого скрипта H1..."
    
    # Устанавливаем права на скрипты в начале
    fix_script_permissions
    
    # Настройка маршрутизации для робота H1 (в самом начале)
    log "Настройка маршрутизации для робота H1..."
    sudo ip route add default via 192.168.123.1 2>/dev/null || warn "Маршрут уже существует или не удалось добавить"

    update_from_git
    
    # ВСЕГДА проверяем Python зависимости (даже при запуске через systemd)
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
main "$@" 