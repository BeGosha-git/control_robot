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

# Функция для запуска бэкенда
start_backend() {
    info "Запуск бэкенда..."
    
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
    
    # Запускаем сервер
    info "Запуск Node.js сервера..."
    if ! node server.js; then
        error "Не удалось запустить бэкенд"
        cd .. || true
        return 1
    fi
    
    # Возвращаемся в корневую директорию
    cd .. || true
    
    return 0
}

# Функция для остановки бэкенда
stop_backend() {
    info "Остановка бэкенда..."
    
    if pgrep -f "node.*server.js" > /dev/null; then
        pkill -f "node.*server.js"
        sleep 2
        if pgrep -f "node.*server.js" > /dev/null; then
            error "Не удалось остановить бэкенд"
            return 1
        fi
    fi
    
    info "Бэкенд остановлен"
    return 0
}

# Функция для проверки и обновления репозитория
update_repository() {
    info "Обновление репозитория..."
    
    # Проверяем, существует ли директория
    if [ ! -d ".git" ]; then
        error "Директория не является git репозиторием"
        return 1
    fi
    
    # Получаем текущую ветку
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    info "Текущая ветка: $current_branch"
    
    # Сохраняем локальные изменения
    if ! git diff --quiet; then
        warn "Обнаружены локальные изменения, сохраняем..."
        git stash
    fi
    
    # Получаем изменения
    if ! git fetch origin; then
        error "Ошибка при получении изменений"
        return 1
    fi
    
    # Проверяем, есть ли изменения
    if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/$current_branch)" ]; then
        info "Нет новых изменений"
        return 0
    fi
    
    # Останавливаем бэкенд перед обновлением
    stop_backend
    
    # Обновляем репозиторий
    if ! git pull origin $current_branch; then
        error "Ошибка при обновлении репозитория"
        return 1
    fi
    
    # Применяем сохраненные изменения, если они были
    if git stash list | grep -q "stash@{0}"; then
        info "Применяем сохраненные изменения..."
        if ! git stash pop; then
            warn "Не удалось применить сохраненные изменения"
        fi
    fi
    
    # Обновляем права на скрипт
    chmod +x "$(pwd)/start_h1_control.sh"
    chown unitree:docker "$(pwd)/start_h1_control.sh"
    
    info "Репозиторий успешно обновлен"
    return 0
}

# Функция для обновления сервиса
update_service() {
    info "Обновление сервиса..."
    
    # Проверяем наличие файла сервиса
    if [ ! -f "control_robot.service" ]; then
        error "Файл сервиса не найден"
        return 1
    fi
    
    # Проверяем, существует ли старый сервис
    if systemctl list-unit-files | grep -q "control_robot.service"; then
        info "Останавливаем старый сервис..."
        systemctl stop control_robot
        systemctl disable control_robot
    fi
    
    # Копируем новый файл сервиса
    info "Копируем новый файл сервиса..."
    cp control_robot.service /etc/systemd/system/
    
    # Устанавливаем права
    chmod 644 /etc/systemd/system/control_robot.service
    
    # Перезагружаем systemd
    systemctl daemon-reload
    
    # Включаем и запускаем сервис
    systemctl enable control_robot
    systemctl start control_robot
    
    info "Сервис успешно обновлен"
    return 0
}

# Функция для запуска фронтенда в Docker
start_frontend() {
    info "Запуск фронтенда в Docker..."
    
    if ! docker compose ps | grep -q "frontend.*Up"; then
        if ! docker compose up -d frontend; then
            error "Не удалось запустить фронтенд"
            return 1
        fi
    else
        info "Фронтенд уже запущен"
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
    
    # Сначала обновляем репозиторий
    if ! update_repository; then
        error "Ошибка при обновлении репозитория"
        exit 1
    fi
    
    # Загружаем nvm
    load_nvm
    
    # Затем устанавливаем Node.js
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