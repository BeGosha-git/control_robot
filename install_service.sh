#!/bin/bash

# Функция для вывода сообщений об ошибках
error() {
    echo -e "\e[31mОшибка: $1\e[0m" >&2
    exit 1
}

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
    error "Этот скрипт должен быть запущен с правами root (sudo)"
fi

# Проверка наличия файла сервиса
if [ ! -f "control_robot.service" ]; then
    error "Файл control_robot.service не найден в текущей директории"
fi

# Проверка наличия пользователя unitree
if ! id "unitree" &>/dev/null; then
    error "Пользователь unitree не существует"
fi

# Проверка наличия группы docker
if ! getent group docker &>/dev/null; then
    error "Группа docker не существует"
fi

# Проверка, что пользователь unitree входит в группу docker
if ! groups unitree | grep -q docker; then
    echo "Добавление пользователя unitree в группу docker..."
    usermod -aG docker unitree || error "Не удалось добавить пользователя в группу docker"
fi

# Установка прав на скрипты
echo "Установка прав на скрипты..."
chmod +x "$WORK_DIR/start_h1.sh" || error "Не удалось установить права на start_h1.sh"
chmod +x "$WORK_DIR/install.sh" || error "Не удалось установить права на install.sh"

# Копирование файла сервиса
echo "Установка системного сервиса..."
cp control_robot.service /etc/systemd/system/ || error "Не удалось скопировать файл сервиса"
chmod 644 /etc/systemd/system/control_robot.service || error "Не удалось установить права на файл сервиса"

# Создание и настройка лог-файла
echo "Настройка лог-файла..."
touch /home/unitree/control_robot.log || error "Не удалось создать лог-файл"
chown unitree:unitree /home/unitree/control_robot.log || error "Не удалось изменить владельца лог-файла"
chmod 644 /home/unitree/control_robot.log || error "Не удалось установить права на лог-файл"

# Перезагрузка systemd
echo "Перезагрузка systemd..."
systemctl daemon-reload || error "Не удалось перезагрузить systemd"

# Включение и запуск сервиса
echo "Включение и запуск сервиса..."
systemctl enable control_robot.service || error "Не удалось включить сервис"
systemctl start control_robot.service || error "Не удалось запустить сервис"

# Проверка статуса
if systemctl is-active --quiet control_robot.service; then
    echo -e "\e[32mСервис успешно установлен и запущен!\e[0m"
    echo -e "\nУправление сервисом:"
    echo "Статус:    sudo systemctl status control_robot"
    echo "Логи:      sudo journalctl -u control_robot -f"
    echo "Перезапуск: sudo systemctl restart control_robot"
    echo "Остановка:  sudo systemctl stop control_robot"
else
    error "Ошибка запуска сервиса. Проверьте логи: sudo journalctl -u control_robot -f"
fi 