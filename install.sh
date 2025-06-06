#!/bin/bash

# Проверка на root права
if [ "$EUID" -ne 0 ]; then 
    echo "Этот скрипт должен быть запущен с правами root (sudo)"
    exit 1
fi

# Добавление пользователя в группу docker
usermod -aG docker $SUDO_USER

# Установка прав на директорию unitree
chown -R $SUDO_USER:$SUDO_USER /home/unitree
chmod -R 777 /home/unitree

# Настройка прав доступа к камере
if [ -e /dev/video0 ]; then
    chmod 666 /dev/video0
    usermod -aG video $SUDO_USER
fi

# Перезапуск сервисов
systemctl restart docker

echo "Установка завершена. Пожалуйста, перезагрузите систему для применения всех изменений."
echo "После перезагрузки запустите ./start_h1.sh для старта приложения" 