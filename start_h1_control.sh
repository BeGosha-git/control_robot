#!/bin/bash

# Функция для логирования
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /home/unitree/control_robot.log
}

# Функции для разных уровней логирования
info() { log "INFO: $1"; }
warn() { log "WARN: $1"; }
error() { log "ERROR: $1"; }

# Функция для установки Node.js
install_nodejs() {
    info "Проверка и установка Node.js..."
    
    # Проверяем наличие Node.js
    if command -v node &> /dev/null; then
        node_version=$(node --version)
        info "Node.js $node_version найден"
        
        # Проверяем версию Node.js
        if [[ "${node_version#v}" < "14.0.0" ]]; then
            info "Требуется обновление Node.js до версии 14 или выше"
            # Удаляем старую версию
            sudo apt-get remove -y nodejs npm
            sudo apt-get autoremove -y
        else
            info "Версия Node.js подходящая"
        fi
    fi
    
    # Проверяем наличие npm
    if ! command -v npm &> /dev/null; then
        info "Установка npm..."
        if ! sudo apt-get install -y npm; then
            error "Не удалось установить npm"
            return 1
        fi
    fi
    
    # Если Node.js отсутствует или требует обновления
    if ! command -v node &> /dev/null || [[ "${node_version#v}" < "14.0.0" ]]; then
        info "Установка/обновление Node.js..."
        
        # Удаляем старые версии
        sudo apt-get remove -y nodejs npm
        sudo apt-get autoremove -y
        
        # Добавляем репозиторий NodeSource
        if ! curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -; then
            error "Не удалось добавить репозиторий Node.js"
            return 1
        fi
        
        # Устанавливаем Node.js
        if ! sudo apt-get install -y nodejs; then
            error "Не удалось установить Node.js"
            return 1
        fi
    fi
    
    # Проверяем установку
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        error "Node.js или npm не установлены корректно"
        return 1
    fi
    
    node_version=$(node --version)
    npm_version=$(npm --version)
    info "Node.js $node_version и npm $npm_version успешно установлены"
    
    # Обновляем npm до последней версии
    info "Обновление npm до последней версии..."
    if ! sudo npm install -g npm@latest; then
        warn "Не удалось обновить npm до последней версии"
    fi
    
    return 0
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
    
    if [ ! -d "backend" ]; then
        error "Директория backend не найдена"
        return 1
    fi
    
    cd backend || return 1
    
    # Проверяем, не запущен ли уже бэкенд
    if pgrep -f "node.*server.js" > /dev/null; then
        info "Бэкенд уже запущен"
        return 0
    fi
    
    # Запускаем бэкенд в фоновом режиме
    nohup node src/server.js > backend.log 2>&1 &
    
    # Проверяем, запустился ли процесс
    sleep 2
    if ! pgrep -f "node.*server.js" > /dev/null; then
        error "Не удалось запустить бэкенд"
        return 1
    fi
    
    cd ..
    info "Бэкенд успешно запущен"
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

# Основной код
main() {
    # Начальное логирование
    info "Запуск скрипта start_h1_control.sh"
    info "Текущая директория: $(pwd)"
    info "Пользователь: $(whoami)"
    info "Группы пользователя: $(groups)"
    
    # Устанавливаем Node.js
    if ! install_nodejs; then
        error "Ошибка при установке Node.js"
        exit 1
    fi
    
    # Обновляем репозиторий
    if ! update_repository; then
        error "Ошибка при обновлении репозитория"
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