#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
log() {
    echo -e "${GREEN}[H1 Service]${NC} $1"
}

error() {
    echo -e "${RED}[H1 Error]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[H1 Warning]${NC} $1"
}

# Проверка на root права
if [ "$EUID" -ne 0 ]; then
    error "Этот скрипт должен быть запущен с правами root (sudo)"
fi

# Проверка наличия пользователя unitree
if ! id "unitree" &>/dev/null; then
    error "Пользователь unitree не существует"
fi

# Проверка наличия группы docker
if ! getent group docker &>/dev/null; then
    error "Группа docker не существует"
fi

# Добавление пользователя unitree в группу docker
if ! groups unitree | grep -q docker; then
    log "Добавление пользователя unitree в группу docker..."
    usermod -aG docker unitree
fi

# Копирование файла сервиса
log "Установка systemd сервиса..."
cp h1-docker.service /etc/systemd/system/
chmod 644 /etc/systemd/system/h1-docker.service

# Создание лог-файла
log "Настройка лог-файла..."
touch /home/unitree/h1_control.log
chown unitree:unitree /home/unitree/h1_control.log
chmod 644 /home/unitree/h1_control.log

# Перезагрузка конфигурации systemd
log "Перезагрузка конфигурации systemd..."
systemctl daemon-reload

# Включение автозапуска
log "Включение автозапуска сервиса..."
systemctl enable h1-docker.service

# Запуск сервиса
log "Запуск сервиса..."
systemctl start h1-docker.service

# Проверка статуса
log "Проверка статуса сервиса..."
if systemctl is-active --quiet h1-docker.service; then
    log "Сервис успешно запущен"
    echo -e "\n${GREEN}Управление сервисом:${NC}"
    echo "Статус:    sudo systemctl status h1-docker"
    echo "Логи:      sudo journalctl -u h1-docker -f"
    echo "Перезапуск: sudo systemctl restart h1-docker"
    echo "Остановка:  sudo systemctl stop h1-docker"
else
    error "Ошибка запуска сервиса. Проверьте логи: sudo journalctl -u h1-docker -f"
fi 