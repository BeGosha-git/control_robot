# Инструкция по установке Control Robot

## Требования

- Ubuntu 20.04 или новее
- Доступ к камере (опционально)

## Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/BeGosha-git/control_robot.git
cd control_robot
```

2. Запустите скрипт установки:
```bash
sudo ./install.sh
```

Скрипт автоматически выполнит следующие действия:
- Проверит и установит Docker (если отсутствует)
- Проверит и установит Docker Compose (если отсутствует)
- Настроит необходимые права доступа для пользователя unitree
- Создаст рабочую директорию и скопирует файлы
- Установит и запустит системный сервис
- Запустит Docker контейнеры
- Проверит доступ к камере

## Проверка установки

После завершения установки приложение должно быть доступно по адресам:
- Frontend: http://localhost
- Backend API: http://localhost:3001

Проверьте статус сервиса:
```bash
sudo systemctl status control_robot
```

## Управление сервисом

### Базовые команды

Проверка статуса:
```bash
sudo systemctl status control_robot
```

Просмотр логов:
```bash
sudo journalctl -u control_robot -f
```

Перезапуск сервиса:
```bash
sudo systemctl restart control_robot
```

Остановка сервиса:
```bash
sudo systemctl stop control_robot
```

Запуск сервиса:
```bash
sudo systemctl start control_robot
```

### Управление Docker контейнерами

Проверка статуса контейнеров:
```bash
docker ps
docker compose ps
```

Перезапуск контейнеров:
```bash
cd /home/unitree/control_robot
docker compose down
docker compose up -d
```

## Устранение неполадок

### 1. Проблемы с сервисом

Если сервис не запускается:
```bash
# Проверка логов
sudo journalctl -u control_robot -f

# Перезапуск сервиса
sudo systemctl restart control_robot

# Полная переустановка сервиса
sudo systemctl stop control_robot
sudo systemctl disable control_robot
sudo rm /etc/systemd/system/control_robot.service
sudo ./install.sh
```

### 2. Проблемы с Docker

Если контейнеры не запускаются:
```bash
# Проверка статуса Docker
systemctl status docker

# Перезапуск Docker
sudo systemctl restart docker

# Перезапуск контейнеров
cd /home/unitree/control_robot
docker compose down
docker compose up -d
```

### 3. Проблемы с правами доступа

Если возникают проблемы с правами доступа:
```bash
# Проверка прав на рабочую директорию
ls -la /home/unitree/control_robot

# Установка прав
sudo chown -R unitree:unitree /home/unitree/control_robot
sudo chmod -R 755 /home/unitree/control_robot
```

### 4. Проблемы с камерой

Если камера не определяется:
```bash
# Проверка наличия камеры
ls -l /dev/video*

# Установка прав на камеру
sudo chmod 666 /dev/video0
sudo usermod -aG video unitree
```

## Удаление

Для полного удаления приложения:
```bash
# Остановка и удаление сервиса
sudo systemctl stop control_robot
sudo systemctl disable control_robot
sudo rm /etc/systemd/system/control_robot.service

# Удаление контейнеров и образов
cd /home/unitree/control_robot
docker compose down
docker rmi control_robot-frontend control_robot-backend

# Удаление рабочей директории
sudo rm -rf /home/unitree/control_robot
``` 