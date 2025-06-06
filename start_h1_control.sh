#!/bin/bash

# Функция для логирования
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> /home/unitree/control_robot.log
}

# Функция для вывода информационных сообщений
info() {
    echo "[INFO] $1"
    log "[INFO] $1"
}

# Функция для вывода предупреждений
warn() {
    echo "[WARN] $1" >&2
    log "[WARN] $1"
}

# Функция для вывода ошибок
error() {
    echo "[ERROR] $1" >&2
    log "[ERROR] $1"
    exit 1
}

# Начинаем выполнение скрипта
log "=== Начало выполнения скрипта ==="
log "Текущая директория: $(pwd)"
log "Пользователь: $(whoami)"
log "Группы: $(groups)"

# Проверка наличия необходимых команд
log "Проверка наличия необходимых команд..."
for cmd in docker systemctl git; do
    if ! command -v $cmd &> /dev/null; then
        error "Команда $cmd не найдена"
    fi
    log "Команда $cmd найдена: $(which $cmd)"
done

# Функция для проверки и обновления сервиса
update_service() {
    info "Проверка системного сервиса..."
    
    # Проверяем, существует ли файл сервиса
    if [ -f "/etc/systemd/system/control_robot.service" ]; then
        # Сравниваем текущий файл сервиса с новым
        if ! cmp -s "control_robot.service" "/etc/systemd/system/control_robot.service"; then
            info "Обнаружена новая версия сервиса, обновляем..."
            # Останавливаем и отключаем старый сервис
            systemctl stop control_robot 2>/dev/null || true
            systemctl disable control_robot 2>/dev/null || true
            # Удаляем старый файл сервиса
            rm -f /etc/systemd/system/control_robot.service || true
            # Копируем новый файл сервиса
            cp control_robot.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
            chmod 644 /etc/systemd/system/control_robot.service || error "Не удалось установить права на файл сервиса"
            # Перезагружаем systemd и запускаем сервис
            systemctl daemon-reload || error "Не удалось перезагрузить systemd"
            systemctl enable control_robot.service || error "Не удалось включить сервис"
            systemctl start control_robot.service || error "Не удалось запустить сервис"
            info "Сервис успешно обновлен"
        else
            info "Сервис актуален"
        fi
    else
        info "Установка нового сервиса..."
        cp control_robot.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
        chmod 644 /etc/systemd/system/control_robot.service || error "Не удалось установить права на файл сервиса"
        systemctl daemon-reload || error "Не удалось перезагрузить systemd"
        systemctl enable control_robot.service || error "Не удалось включить сервис"
        systemctl start control_robot.service || error "Не удалось запустить сервис"
        info "Сервис успешно установлен"
    fi
}

# Функция для обновления репозитория
update_repository() {
    info "Обновление репозитория..."
    
    # Сохраняем configs.conf
    if [ -f "backend/configs.conf" ]; then
        info "Сохранение configs.conf..."
        cp backend/configs.conf /tmp/configs.conf.backup || warn "Не удалось сохранить configs.conf"
    fi
    
    # Получаем последние изменения
    git fetch origin || error "Не удалось получить изменения из репозитория"
    git reset --hard origin/main || error "Не удалось обновить локальные файлы"
    
    # Восстанавливаем configs.conf
    if [ -f "/tmp/configs.conf.backup" ]; then
        info "Восстановление configs.conf..."
        cp /tmp/configs.conf.backup backend/configs.conf || warn "Не удалось восстановить configs.conf"
        rm /tmp/configs.conf.backup
    fi
}

start_docker_containers() {
    info "Запуск Docker контейнеров..."
    
    # Проверяем, запущены ли уже контейнеры
    if docker compose ps | grep -q "Up"; then
        info "Контейнеры уже запущены"
        return 0
    fi
    
    # Запускаем контейнеры
    if ! docker compose up -d; then
        error "Не удалось запустить Docker контейнеры"
        return 1
    fi
    
    # Ждем, пока контейнеры полностью запустятся
    info "Ожидание запуска контейнеров..."
    sleep 10
    
    # Проверяем статус контейнеров
    if ! docker compose ps | grep -q "Up"; then
        error "Контейнеры не запустились"
        return 1
    fi
    
    info "Docker контейнеры успешно запущены"
    return 0
}

build_and_install_sdk() {
    info "Сборка и установка SDK..."
    
    # Проверяем, что контейнер backend запущен
    if ! docker compose ps | grep -q "h1_site-backend-1.*Up"; then
        error "Контейнер backend не запущен"
        return 1
    fi
    
    # Выполняем команды в контейнере backend
    if ! docker compose exec -T backend bash -c "cd /home/unitree/unitree_sdk2-main && cd build && cmake .. && make"; then
        error "Ошибка сборки SDK"
        return 1
    fi
    
    info "SDK успешно собран и установлен"
    return 0
}

main() {
    log "=== Начало выполнения скрипта ==="
    log "Текущая директория: $(pwd)"
    log "Пользователь: $(whoami)"
    log "Группы: $(groups)"
    
    # Проверяем наличие необходимых команд
    check_required_commands
    
    # Обновляем репозиторий
    update_repository
    
    # Обновляем сервис
    update_service
    
    # Запускаем Docker контейнеры
    if ! start_docker_containers; then
        error "Не удалось запустить Docker контейнеры"
        exit 1
    fi
    
    # Собираем и устанавливаем SDK
    if ! build_and_install_sdk; then
        error "Не удалось собрать и установить SDK"
        exit 1
    fi
    
    # Запускаем сервис
    if ! run_as_root systemctl restart control_robot; then
        error "Не удалось запустить сервис control_robot"
        exit 1
    fi
    
    info "Установка и настройка завершены успешно"
    log "=== Завершение выполнения скрипта ==="
}

# Проверка доступа к камере
info "Проверка доступа к камере..."
if [ -e "/dev/video0" ]; then
    info "Камера найдена"
else
    warn "Камера не найдена. Проверьте подключение и права доступа."
fi

# Проверка и запуск Docker контейнеров
info "Запуск Docker контейнеров..."
docker compose up --build -d || error "Не удалось запустить контейнеры"

# Проверка статуса сервиса
if systemctl is-active --quiet control_robot.service; then
    info "Сервис успешно запущен"
    echo "=== Управление сервисом ==="
    echo "Статус:    systemctl status control_robot"
    echo "Логи:      journalctl -u control_robot -f"
    echo "Перезапуск: systemctl restart control_robot"
    echo "Остановка:  systemctl stop control_robot"
else
    warn "Сервис не запущен. Проверьте логи: journalctl -u control_robot -f"
fi

main 