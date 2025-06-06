#!/bin/bash

# Функция для логирования
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /home/unitree/control_robot.log
}

# Функции для разных уровней логирования
info() { log "INFO: $1"; }
warn() { log "WARN: $1"; }
error() { log "ERROR: $1"; }

# Функция для установки Node.js через nvm
install_nodejs() {
    info "Проверка и установка Node.js через nvm..."
    
    # Проверяем наличие nvm
    if [ ! -d "$HOME/.nvm" ]; then
        info "Установка nvm..."
        # Устанавливаем nvm
        if ! curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash; then
            error "Не удалось установить nvm"
            return 1
        fi
        
        # Загружаем nvm в текущую сессию
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    else
        # Загружаем nvm если он уже установлен
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    
    # Проверяем, что nvm доступен
    if ! command -v nvm &> /dev/null; then
        error "nvm не найден после установки"
        return 1
    fi
    
    # Устанавливаем Node.js 18.x
    info "Установка Node.js 18.x через nvm..."
    if ! nvm install 18; then
        error "Не удалось установить Node.js через nvm"
        return 1
    fi
    
    # Используем установленную версию
    nvm use 18
    
    # Проверяем установку
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        error "Node.js не установлен корректно"
        return 1
    fi
    
    node_version=$(node --version)
    npm_version=$(npm --version)
    info "Node.js $node_version и npm $npm_version успешно установлены"
    
    # Добавляем nvm в .bashrc если его там нет
    if ! grep -q "NVM_DIR" "$HOME/.bashrc"; then
        echo 'export NVM_DIR="$HOME/.nvm"' >> "$HOME/.bashrc"
        echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> "$HOME/.bashrc"
        echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> "$HOME/.bashrc"
    fi
    
    return 0
}

# Функция для загрузки nvm в текущую сессию
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
}

# Функция для установки зависимостей бэкенда
install_backend_deps() {
    info "Установка зависимостей бэкенда..."
    
    if [ ! -d "backend" ]; then
        error "Директория backend не найдена"
        return 1
    fi
    
    cd backend || return 1
    
    # Устанавливаем зависимости
    if ! npm install; then
        error "Не удалось установить зависимости бэкенда"
        return 1
    fi
    
    cd ..
    info "Зависимости бэкенда успешно установлены"
    return 0
}

# Функция для проверки и освобождения порта
check_and_free_port() {
    local port=$1
    info "Проверка порта $port..."
    
    # Проверяем, используется ли порт
    if lsof -i :$port > /dev/null 2>&1; then
        info "Порт $port занят, пытаемся освободить..."
        
        # Получаем PID процесса, использующего порт
        local pid=$(lsof -t -i :$port)
        if [ -n "$pid" ]; then
            info "Найден процесс с PID $pid, использующий порт $port"
            
            # Пытаемся корректно завершить процесс
            if kill -15 $pid 2>/dev/null; then
                info "Отправлен сигнал завершения процессу $pid"
                # Даем процессу время на корректное завершение
                sleep 2
                
                # Проверяем, завершился ли процесс
                if kill -0 $pid 2>/dev/null; then
                    warn "Процесс $pid не завершился корректно, принудительно завершаем..."
                    kill -9 $pid 2>/dev/null
                    sleep 1
                fi
            else
                warn "Не удалось отправить сигнал завершения, принудительно завершаем процесс $pid"
                kill -9 $pid 2>/dev/null
                sleep 1
            fi
        fi
        
        # Проверяем, освободился ли порт
        if lsof -i :$port > /dev/null 2>&1; then
            error "Не удалось освободить порт $port"
            return 1
        else
            info "Порт $port успешно освобожден"
        fi
    else
        info "Порт $port свободен"
    fi
    
    return 0
}

# Функция для запуска бэкенда
start_backend() {
    info "Запуск бэкенда..."
    
    # Проверяем и освобождаем порт 3001
    if ! check_and_free_port 3001; then
        error "Не удалось подготовить порт для бэкенда"
        return 1
    fi
    
    # Проверяем наличие server.js
    if [ ! -f "backend/server.js" ]; then
        error "Файл server.js не найден в директории backend"
        return 1
    fi
    
    # Проверяем наличие package.json
    if [ ! -f "backend/package.json" ]; then
        error "Файл package.json не найден в директории backend"
        return 1
    fi
    
    # Переходим в директорию бэкенда
    cd backend || {
        error "Не удалось перейти в директорию backend"
        return 1
    }
    
    # Запускаем сервер в фоновом режиме
    info "Запуск Node.js сервера в фоновом режиме..."
    nohup node server.js > ../backend.log 2>&1 &
    BACKEND_PID=$!
    
    # Проверяем, запустился ли процесс
    sleep 2
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        error "Не удалось запустить бэкенд"
        cd .. || true
        return 1
    fi
    
    # Возвращаемся в корневую директорию
    cd .. || true
    
    info "Бэкенд успешно запущен (PID: $BACKEND_PID)"
    return 0
}

# Функция для остановки бэкенда
stop_backend() {
    info "Остановка бэкенда..."
    
    # Проверяем и освобождаем порт 3001
    if ! check_and_free_port 3001; then
        warn "Не удалось корректно остановить бэкенд"
        return 1
    fi
    
    return 0
}

# Функция для обновления репозитория
update_repository() {
    info "Обновление репозитория..."
    
    # Проверяем наличие .git
    if [ ! -d ".git" ]; then
        error "Директория .git не найдена"
        return 1
    fi
    
    # Сохраняем configs.conf если он существует
    if [ -f "backend/configs.conf" ]; then
        info "Сохраняем локальный configs.conf..."
        cp backend/configs.conf /tmp/configs.conf.backup
    fi
    
    # Сбрасываем все локальные изменения
    info "Сброс локальных изменений..."
    git reset --hard HEAD
    git clean -fd
    
    # Получаем последние изменения
    info "Получение последних изменений из репозитория..."
    if ! git pull; then
        error "Не удалось получить изменения из репозитория"
        return 1
    fi
    
    # Восстанавливаем configs.conf если он был сохранен
    if [ -f "/tmp/configs.conf.backup" ]; then
        info "Восстанавливаем локальный configs.conf..."
        cp /tmp/configs.conf.backup backend/configs.conf
        rm /tmp/configs.conf.backup
    fi
    
    # Устанавливаем права на исполнение для скрипта
    chmod +x "$(pwd)/start_h1_control.sh"
    
    info "Репозиторий успешно обновлен"
    return 0
}

# Функция для обновления сервиса
update_service() {
    info "Проверка и обновление сервиса..."
    
    # Путь к файлу сервиса в системе
    local service_path="/etc/systemd/system/control_robot.service"
    # Путь к файлу сервиса в репозитории
    local repo_service_path="control_robot.service"
    
    # Проверяем наличие файла сервиса в репозитории
    if [ ! -f "$repo_service_path" ]; then
        error "Файл сервиса не найден в репозитории"
        return 1
    }
    
    # Проверяем, существует ли сервис в системе
    if [ -f "$service_path" ]; then
        # Сравниваем файлы
        if ! cmp -s "$repo_service_path" "$service_path"; then
            info "Обнаружена новая версия сервиса, обновляем..."
            
            # Останавливаем сервис если он запущен
            if systemctl is-active --quiet control_robot; then
                info "Останавливаем текущий сервис..."
                systemctl stop control_robot
            fi
            
            # Отключаем сервис
            if systemctl is-enabled --quiet control_robot; then
                info "Отключаем текущий сервис..."
                systemctl disable control_robot
            fi
            
            # Удаляем старый файл сервиса
            info "Удаляем старый файл сервиса..."
            rm -f "$service_path"
        else
            info "Сервис актуален, обновление не требуется"
            return 0
        fi
    fi
    
    # Копируем новый файл сервиса
    info "Копируем новый файл сервиса..."
    if ! cp "$repo_service_path" "$service_path"; then
        error "Не удалось скопировать файл сервиса"
        return 1
    fi
    
    # Устанавливаем права
    info "Устанавливаем права на файл сервиса..."
    chmod 644 "$service_path"
    
    # Перезагружаем systemd
    info "Перезагрузка systemd..."
    if ! systemctl daemon-reload; then
        error "Не удалось перезагрузить systemd"
        return 1
    fi
    
    # Включаем сервис
    info "Включаем сервис..."
    if ! systemctl enable control_robot; then
        error "Не удалось включить сервис"
        return 1
    fi
    
    # Запускаем сервис если он был запущен
    if systemctl is-active --quiet control_robot; then
        info "Запускаем обновленный сервис..."
        if ! systemctl start control_robot; then
            error "Не удалось запустить сервис"
            return 1
        fi
    fi
    
    info "Сервис успешно обновлен"
    return 0
}

# Функция для запуска фронтенда
start_frontend() {
    info "Запуск фронтенда..."
    
    # Проверяем наличие docker-compose.yml
    if [ ! -f "docker-compose.yml" ]; then
        error "Файл docker-compose.yml не найден"
        return 1
    fi
    
    # Проверяем наличие директории frontend
    if [ ! -d "frontend" ]; then
        error "Директория frontend не найдена"
        return 1
    fi
    
    # Проверяем, не запущены ли уже контейнеры
    if docker compose ps | grep -q "frontend"; then
        info "Останавливаем существующие контейнеры..."
        docker compose down
    fi
    
    # Запускаем контейнеры
    info "Запуск Docker контейнеров..."
    if ! docker compose up --build -d; then
        error "Не удалось запустить Docker контейнеры"
        return 1
    fi
    
    # Проверяем, что контейнеры запущены
    if ! docker compose ps | grep -q "frontend.*Up"; then
        error "Контейнер frontend не запущен"
        return 1
    fi
    
    info "Фронтенд успешно запущен"
    return 0
}

# Функция main
main() {
    # Начальное логирование
    info "Запуск скрипта start_h1_control.sh"
    info "Текущая директория: $(pwd)"
    info "Пользователь: $(whoami)"
    info "Группы пользователя: $(groups)"
    
    # Останавливаем текущий бэкенд перед обновлением
    stop_backend
    
    # Обновляем репозиторий
    if ! update_repository; then
        error "Ошибка при обновлении репозитория"
        exit 1
    fi
    
    # Загружаем nvm
    load_nvm
    
    # Устанавливаем Node.js
    if ! install_nodejs; then
        error "Ошибка при установке Node.js"
        exit 1
    fi
    
    # Устанавливаем зависимости бэкенда
    if ! install_backend_deps; then
        error "Ошибка при установке зависимостей бэкенда"
        exit 1
    fi
    
    # Обновляем сервис
    if ! update_service; then
        error "Ошибка при обновлении сервиса"
        exit 1
    fi
    
    # Запускаем бэкенд
    if ! start_backend; then
        error "Ошибка при запуске бэкенда"
        exit 1
    fi
    
    # Запускаем фронтенд
    if ! start_frontend; then
        error "Ошибка при запуске фронтенда"
        exit 1
    fi
    
    info "Все компоненты успешно запущены"
}

# Запускаем основной код
main 