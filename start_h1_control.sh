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

# Определяем рабочую директорию
WORK_DIR="/home/unitree/control_robot"
CURRENT_DIR=$(pwd)

# Если мы не в рабочей директории, копируем файлы
if [ "$CURRENT_DIR" != "$WORK_DIR" ]; then
    info "Установка в рабочую директорию..."
    
    # Создаем рабочую директорию если её нет
    mkdir -p "$WORK_DIR" || error "Не удалось создать рабочую директорию"
    
    # Копируем файлы
    cp -r ./* "$WORK_DIR/" || error "Не удалось скопировать файлы"
    cp -r ./.* "$WORK_DIR/" 2>/dev/null || true
    
    # Переходим в рабочую директорию
    cd "$WORK_DIR" || error "Не удалось перейти в рабочую директорию"
    
    # Обновляем репозиторий
    update_repository
else
    info "Установка в текущей директории..."
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