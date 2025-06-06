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

# Функция для выполнения команд с sudo если нужно
run_as_root() {
    if [ "$EUID" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
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

    # Обновляем права
    chown -R unitree:unitree . || warn "Не удалось обновить владельца файлов"
}

# Функция для проверки и обновления сервиса
update_service() {
    info "Проверка системного сервиса..."
    
    # Устанавливаем права на выполнение для скрипта
    run_as_root chmod +x "$(pwd)/start_h1_control.sh" || error "Не удалось установить права на выполнение для start_h1_control.sh"
    run_as_root chown unitree:docker "$(pwd)/start_h1_control.sh" || error "Не удалось установить владельца для start_h1_control.sh"
    
    # Проверяем, существует ли файл сервиса
    if [ -f "/etc/systemd/system/control_robot.service" ]; then
        # Сравниваем текущий файл сервиса с новым
        if ! cmp -s "control_robot.service" "/etc/systemd/system/control_robot.service"; then
            info "Обнаружена новая версия сервиса, обновляем..."
            # Останавливаем и отключаем старый сервис
            run_as_root systemctl stop control_robot 2>/dev/null
            run_as_root systemctl disable control_robot 2>/dev/null
            # Удаляем старый файл сервиса
            run_as_root rm -f /etc/systemd/system/control_robot.service
            # Копируем новый файл сервиса
            run_as_root cp control_robot.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
            run_as_root chmod 644 /etc/systemd/system/control_robot.service || error "Не удалось установить права на файл сервиса"
            # Перезагружаем systemd и запускаем сервис
            run_as_root systemctl daemon-reload || error "Не удалось перезагрузить systemd"
            run_as_root systemctl enable control_robot.service || error "Не удалось включить сервис"
            run_as_root systemctl start control_robot.service || error "Не удалось запустить сервис"
            info "Сервис успешно обновлен"
        else
            info "Сервис актуален"
        fi
    else
        info "Установка нового сервиса..."
        run_as_root cp control_robot.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
        run_as_root chmod 644 /etc/systemd/system/control_robot.service || error "Не удалось установить права на файл сервиса"
        run_as_root systemctl daemon-reload || error "Не удалось перезагрузить systemd"
        run_as_root systemctl enable control_robot.service || error "Не удалось включить сервис"
        run_as_root systemctl start control_robot.service || error "Не удалось запустить сервис"
        info "Сервис успешно установлен"
    fi
}

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    info "Установка Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh || error "Не удалось установить Docker"
    rm get-docker.sh
fi

# Проверка наличия Docker Compose
if ! command -v docker compose &> /dev/null; then
    info "Установка Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose || error "Не удалось установить Docker Compose"
fi

# Проверка наличия пользователя unitree
if ! id "unitree" &>/dev/null; then
    error "Пользователь unitree не существует"
fi

# Проверка наличия группы docker
if ! getent group docker &>/dev/null; then
    info "Создание группы docker..."
    groupadd docker || error "Не удалось создать группу docker"
fi

# Проверка, что пользователь unitree входит в группу docker
if ! groups unitree | grep -q docker; then
    info "Добавление пользователя unitree в группу docker..."
    usermod -aG docker unitree || error "Не удалось добавить пользователя в группу docker"
fi

# Проверка и создание рабочей директории
WORK_DIR="/home/unitree/control_robot"
CURRENT_DIR=$(pwd)

# Если мы уже в рабочей директории, обновляем репозиторий
if [ "$CURRENT_DIR" = "$WORK_DIR" ]; then
    info "Установка в текущей директории..."
    update_repository
else
    if [ ! -d "$WORK_DIR" ]; then
        info "Создание рабочей директории..."
        mkdir -p "$WORK_DIR" || error "Не удалось создать рабочую директорию"
    fi

    # Копирование файлов в рабочую директорию
    info "Копирование файлов в рабочую директорию..."
    cp -r ./* "$WORK_DIR/" || error "Не удалось скопировать файлы"
    chown -R unitree:unitree "$WORK_DIR" || error "Не удалось изменить владельца файлов"
    
    # Переходим в рабочую директорию и обновляем репозиторий
    cd "$WORK_DIR" || error "Не удалось перейти в рабочую директорию"
    update_repository
fi

# Проверка и установка системного сервиса
if [ -f "control_robot.service" ]; then
    update_service
else
    warn "Файл control_robot.service не найден, пропускаем установку сервиса"
fi

# Проверка доступа к камере
info "Проверка доступа к камере..."
if [ -e "/dev/video0" ]; then
    chmod 666 /dev/video0 || warn "Не удалось установить права на камеру"
else
    warn "Камера не найдена. Проверьте подключение и права доступа."
fi

# Проверка и запуск Docker контейнеров
info "Запуск Docker контейнеров..."
if [ "$EUID" -eq 0 ]; then
    # Если запущено от root, переключаемся на пользователя unitree
    runuser -u unitree -- docker compose up -d || error "Не удалось запустить контейнеры"
else
    # Если запущено от unitree, запускаем напрямую
    docker compose up -d || error "Не удалось запустить контейнеры"
fi

# Проверка статуса сервиса
if run_as_root systemctl is-active --quiet control_robot.service; then
    info "Сервис успешно запущен"
    echo "=== Управление сервисом ==="
    echo "Статус:    sudo systemctl status control_robot"
    echo "Логи:      sudo journalctl -u control_robot -f"
    echo "Перезапуск: sudo systemctl restart control_robot"
    echo "Остановка:  sudo systemctl stop control_robot"
else
    warn "Сервис не запущен. Проверьте логи: sudo journalctl -u control_robot -f"
fi 