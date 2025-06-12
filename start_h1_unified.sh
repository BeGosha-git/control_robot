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
elif [ "$USER" = "unitree" ]; then
    # Запуск от unitree - тоже нормально
    RUNNING_AS_ROOT=false
    info "Запуск от пользователя unitree"
else
    # Запуск от обычного пользователя без sudo
    error "Этот скрипт должен быть запущен с правами root (sudo) или от пользователя unitree"
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
}

# Функция для проверки портов
check_ports() {
    log "Проверка портов..."
    
    # Проверяем порт 3001 (backend)
    if ss -tuln 2>/dev/null | grep -q ":3001 "; then
        warn "Порт 3001 уже занят. Возможно, старый backend все еще работает."
        # Показываем информацию о процессе
        PORT_3001_INFO=$(ss -tulpn 2>/dev/null | grep ":3001 " | head -1)
        if [ -n "$PORT_3001_INFO" ]; then
            info "Информация о процессе на порту 3001: $PORT_3001_INFO"
        fi
    else
        info "Порт 3001 свободен"
    fi
    
    # Проверяем порт 5000 (Python сервис камер)
    if ss -tuln 2>/dev/null | grep -q ":5000 "; then
        warn "Порт 5000 уже занят. Возможно, старый Python сервис камер все еще работает."
        # Показываем информацию о процессе
        PORT_5000_INFO=$(ss -tulpn 2>/dev/null | grep ":5000 " | head -1)
        if [ -n "$PORT_5000_INFO" ]; then
            info "Информация о процессе на порту 5000: $PORT_5000_INFO"
        fi
    else
        info "Порт 5000 свободен"
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
    
    # Остановка системного сервиса (только при ручном запуске)
    if [ -z "$SYSTEMD_EXEC_PID" ]; then
        if systemctl is-active control_robot.service > /dev/null 2>&1; then
        info "Остановка системного сервиса..."
            systemctl stop control_robot.service || warn "Не удалось остановить системный сервис"
        sleep 2
        fi
    else
        info "Автозапуск через systemd - пропускаем остановку системного сервиса"
    fi
    
    # Остановка Docker контейнеров
    docker compose down 2>/dev/null || true
    
    # Агрессивная очистка портов 3001 и 5000
    info "Очистка портов 3001 и 5000..."
    
    # Используем lsof для поиска процессов (если доступен)
    if command -v lsof >/dev/null 2>&1; then
        # Находим и убиваем процессы на порту 3001 через lsof
        LSOF_3001_PIDS=$(lsof -ti:3001 2>/dev/null || true)
        if [ -n "$LSOF_3001_PIDS" ]; then
            info "Найдены процессы на порту 3001 (lsof): $LSOF_3001_PIDS"
            echo "$LSOF_3001_PIDS" | xargs -r kill -9 2>/dev/null || true
            sleep 1
        fi
        
        # Находим и убиваем процессы на порту 5000 через lsof
        LSOF_5000_PIDS=$(lsof -ti:5000 2>/dev/null || true)
        if [ -n "$LSOF_5000_PIDS" ]; then
            info "Найдены процессы на порту 5000 (lsof): $LSOF_5000_PIDS"
            echo "$LSOF_5000_PIDS" | xargs -r kill -9 2>/dev/null || true
            sleep 1
        fi
    fi
    
    # Находим и убиваем процессы на порту 3001 через ss
    PORT_3001_PIDS=$(ss -tulpn 2>/dev/null | grep ":3001 " | awk '{print $7}' | sed 's/.*pid=\([0-9]*\).*/\1/' | sort -u)
    if [ -n "$PORT_3001_PIDS" ]; then
        info "Найдены процессы на порту 3001 (ss): $PORT_3001_PIDS"
        echo "$PORT_3001_PIDS" | xargs -r kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # Находим и убиваем процессы на порту 5000 через ss
    PORT_5000_PIDS=$(ss -tulpn 2>/dev/null | grep ":5000 " | awk '{print $7}' | sed 's/.*pid=\([0-9]*\).*/\1/' | sort -u)
    if [ -n "$PORT_5000_PIDS" ]; then
        info "Найдены процессы на порту 5000 (ss): $PORT_5000_PIDS"
        echo "$PORT_5000_PIDS" | xargs -r kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # Используем netstat как fallback (если доступен)
    if command -v netstat >/dev/null 2>&1; then
        # Находим и убиваем процессы на порту 3001 через netstat
        NETSTAT_3001_PIDS=$(netstat -tulpn 2>/dev/null | grep ":3001 " | awk '{print $7}' | sed 's/.*\/\([0-9]*\).*/\1/' | sort -u)
        if [ -n "$NETSTAT_3001_PIDS" ]; then
            info "Найдены процессы на порту 3001 (netstat): $NETSTAT_3001_PIDS"
            echo "$NETSTAT_3001_PIDS" | xargs -r kill -9 2>/dev/null || true
            sleep 1
        fi
        
        # Находим и убиваем процессы на порту 5000 через netstat
        NETSTAT_5000_PIDS=$(netstat -tulpn 2>/dev/null | grep ":5000 " | awk '{print $7}' | sed 's/.*\/\([0-9]*\).*/\1/' | sort -u)
        if [ -n "$NETSTAT_5000_PIDS" ]; then
            info "Найдены процессы на порту 5000 (netstat): $NETSTAT_5000_PIDS"
            echo "$NETSTAT_5000_PIDS" | xargs -r kill -9 2>/dev/null || true
            sleep 1
        fi
    fi
    
    # Останавливаем все backend процессов (более надежно)
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
    
    # Останавливаем все процессы npm start (на случай если PID файл устарел)
    PIDS=$(sudo -u unitree pgrep -f "npm start" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        info "Остановка дополнительных backend процессов: $PIDS"
        echo "$PIDS" | xargs -r sudo -u unitree kill 2>/dev/null || true
        sleep 2
        echo "$PIDS" | xargs -r sudo -u unitree kill -9 2>/dev/null || true
    fi
    
    # Останавливаем все процессы node server.js
    NODE_PIDS=$(sudo -u unitree pgrep -f "node server.js" 2>/dev/null || true)
    if [ -n "$NODE_PIDS" ]; then
        info "Остановка процессов node server.js: $NODE_PIDS"
        echo "$NODE_PIDS" | xargs -r sudo -u unitree kill 2>/dev/null || true
        sleep 2
        echo "$NODE_PIDS" | xargs -r sudo -u unitree kill -9 2>/dev/null || true
    fi
    
    # Останавливаем все Python процессы camera_service
    PYTHON_PIDS=$(sudo -u unitree pgrep -f "camera_service" 2>/dev/null || true)
    if [ -n "$PYTHON_PIDS" ]; then
        info "Остановка Python процессов camera_service: $PYTHON_PIDS"
        echo "$PYTHON_PIDS" | xargs -r sudo -u unitree kill 2>/dev/null || true
        sleep 2
        echo "$PYTHON_PIDS" | xargs -r sudo -u unitree kill -9 2>/dev/null || true
    fi
    
    # Очищаем временные файлы
    rm -f /tmp/start_backend.sh 2>/dev/null || true
    rm -f /tmp/nvm_*.sh 2>/dev/null || true
    
    # Ждем немного для полной остановки
    sleep 2
    
    # Финальная проверка портов
    if ss -tulpn 2>/dev/null | grep -q ":3001 "; then
        warn "Порт 3001 все еще занят после очистки"
    else
        info "Порт 3001 освобожден"
    fi
    
    if ss -tulpn 2>/dev/null | grep -q ":5000 "; then
        warn "Порт 5000 все еще занят после очистки"
    else
        info "Порт 5000 освобожден"
    fi
}

# Функция для запуска backend
start_backend() {
    log "Запуск backend..."
    cd backend || error "Не удалось перейти в директорию backend"
    
    # Проверяем, не запущен ли уже backend
    if [ -n "$(sudo -u unitree pgrep -f "npm start" 2>/dev/null)" ]; then
        warn "Backend уже запущен. Остановка старого процесса..."
        sudo -u unitree pkill -f "npm start" 2>/dev/null || true
        sleep 2
    fi
    
    # Проверяем, что порт 3001 свободен
    info "Проверка доступности порта 3001..."
    for i in {1..15}; do
        if ! ss -tuln 2>/dev/null | grep -q ":3001 "; then
            # Дополнительная проверка через lsof если доступен
            if command -v lsof >/dev/null 2>&1; then
                if ! lsof -ti:3001 >/dev/null 2>&1; then
                    info "Порт 3001 свободен (проверено через ss и lsof)"
                    break
                else
                    warn "Порт 3001 занят (lsof) (попытка $i/15). Ожидание..."
                    sleep 3
                fi
            else
                info "Порт 3001 свободен"
                break
            fi
        else
            warn "Порт 3001 все еще занят (ss) (попытка $i/15). Ожидание..."
            sleep 3
        fi
    done
    
    # Финальная проверка порта
    if ss -tuln 2>/dev/null | grep -q ":3001 "; then
        warn "Порт 3001 все еще занят после ожидания. Backend попробует запуститься на другом порту."
    else
        info "Порт 3001 готов для запуска backend"
    fi
    
    # Запуск backend в фоне через nvm
    info "Запуск backend через nvm..."
    
    # Создаем временный скрипт для запуска с уникальным именем
    TEMP_SCRIPT="/tmp/start_backend_$$.sh"
    cat > "$TEMP_SCRIPT" << 'EOF'
#!/bin/bash
set -e

# Настройка окружения для systemd
export HOME="/home/unitree"
export NVM_DIR="/home/unitree/.nvm"
export PATH="/home/unitree/.nvm/versions/node/v18.19.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Загружаем nvm если доступен
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm use 18 2>/dev/null || echo "nvm use 18 не удался, используем системный node"
fi

# Переходим в директорию backend
cd /home/unitree/control_robot/backend

# Проверяем наличие node_modules
if [ ! -d "node_modules" ]; then
    echo "node_modules не найден, устанавливаем зависимости..."
    npm install
fi

# Проверяем, что node и npm доступны
if ! command -v node >/dev/null 2>&1; then
    echo "ОШИБКА: node не найден в PATH"
    echo "PATH: $PATH"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "ОШИБКА: npm не найден в PATH"
    echo "PATH: $PATH"
    exit 1
fi

# Запускаем сервер через npm start
echo "Запуск Node.js сервера через npm start..."
exec npm start > /home/unitree/backend.log 2>&1
EOF
    
    chmod +x "$TEMP_SCRIPT"
    
    # Запускаем через sudo -u unitree
    info "Запуск backend процесса..."
    sudo -u unitree "$TEMP_SCRIPT" &
    BACKEND_PID=$!
    
    # Ждем больше времени для запуска в systemd окружении
    sleep 10
    
    # Проверяем, что процесс запущен и получаем его PID
    if kill -0 $BACKEND_PID 2>/dev/null; then
        # Проверяем, что это действительно наш процесс npm start
        if sudo -u unitree pgrep -f "npm start" | grep -q "$BACKEND_PID"; then
            echo $BACKEND_PID > /home/unitree/backend.pid
        info "Backend запущен (PID: $BACKEND_PID)"
        else
            # Проверяем логи для диагностики
            if [ -f "/home/unitree/backend.log" ]; then
                error "Процесс запущен, но не является npm start. Последние строки лога:"
                tail -10 /home/unitree/backend.log
            else
                error "Процесс запущен, но не является npm start. Лог-файл не создан."
            fi
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
}

# Запуск основной функции
main "$@" 