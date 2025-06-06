# Установка H1 Control Center на Ubuntu

## Системные требования
- Ubuntu 20.04 LTS или новее
- Минимум 2 ГБ RAM
- Минимум 10 ГБ свободного места
- Доступ в интернет
- Права sudo

## 1. Подготовка системы

### Обновление системы
```bash
sudo apt update
sudo apt upgrade -y
```

### Установка необходимых пакетов
```bash
sudo apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    build-essential
```

## 2. Установка Docker

### Установка Docker через apt
```bash
# Установка Docker и необходимых компонентов
sudo apt update
sudo apt install -y docker.io docker-compose

# Проверка установки Docker
sudo docker run hello-world

# Добавление текущего пользователя в группу docker
sudo usermod -aG docker $USER

# Включение автозапуска Docker
sudo systemctl enable docker
sudo systemctl start docker
```

## 3. Настройка пользователя

### Создание пользователя unitree (если не существует)
```bash
sudo useradd -m -s /bin/bash unitree
sudo passwd unitree
```

### Добавление пользователя в необходимые группы
```bash
# Добавление в группу docker
sudo usermod -aG docker unitree

# Добавление в группу video для работы с камерой
sudo usermod -aG video unitree

# Добавление в группу sudo для работы с файлами
sudo usermod -aG sudo unitree
```

### Настройка прав доступа
```bash
# Создание директории проекта
sudo mkdir -p /home/unitree/h1_site

# Установка прав на домашнюю директорию unitree
sudo chown -R unitree:unitree /home/unitree
sudo chmod -R 755 /home/unitree

# Установка прав на доступ к камере
sudo chmod 666 /dev/video0 || true

# Настройка прав на выполнение sudo без пароля для unitree
echo "unitree ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/unitree
sudo chmod 440 /etc/sudoers.d/unitree
```

## 4. Установка проекта

### Клонирование репозитория
```bash
sudo -u unitree git clone <URL_РЕПОЗИТОРИЯ> /home/unitree/h1_site
cd /home/unitree/h1_site
```

### Установка сервиса автозапуска
```bash
sudo ./install_service.sh
```

## 5. Проверка установки

### Проверка статуса сервиса
```bash
sudo systemctl status h1-docker
```

### Проверка логов
```bash
sudo journalctl -u h1-docker -f
```

### Проверка доступности сервисов
```bash
# Проверка frontend
curl -I http://localhost

# Проверка backend
curl -I http://localhost/api/status
```

### Проверка прав доступа
```bash
# Проверка доступа к файлам
sudo -u unitree touch /home/unitree/test_file
sudo -u unitree rm /home/unitree/test_file

# Проверка доступа к камере
sudo -u unitree ls -l /dev/video0
```

## 6. Управление сервисом

### Основные команды
```bash
# Статус сервиса
sudo systemctl status h1-docker

# Просмотр логов
sudo journalctl -u h1-docker -f

# Перезапуск сервиса
sudo systemctl restart h1-docker

# Остановка сервиса
sudo systemctl stop h1-docker

# Запуск сервиса
sudo systemctl start h1-docker
```

### Просмотр логов приложения
```bash
# Логи Docker
sudo docker-compose logs -f

# Логи сервиса
tail -f /home/unitree/h1_docker.log
```

## 7. Устранение неполадок

### Если сервис не запускается
1. Проверьте логи:
```bash
sudo journalctl -u h1-docker -f
sudo docker-compose logs
```

2. Проверьте права доступа:
```bash
# Проверка прав на директории
sudo ls -la /home/unitree
sudo ls -la /home/unitree/h1_site

# Проверка прав на файлы
sudo ls -la /dev/video0

# Проверка групп пользователя
groups unitree
```

3. Проверьте статус Docker:
```bash
sudo systemctl status docker
```

### Если нет доступа к файлам
1. Проверьте монтирование:
```bash
sudo docker-compose exec backend ls -la /home/unitree
```

2. Проверьте права в контейнере:
```bash
sudo docker-compose exec backend id
```

3. Пересоздайте контейнеры:
```bash
sudo docker-compose down
sudo docker-compose up -d
```

### Если нет доступа к камере
1. Проверьте наличие камеры:
```bash
ls -l /dev/video*
```

2. Установите права:
```bash
sudo chmod 666 /dev/video0
sudo usermod -aG video unitree
```

### Если порты заняты
1. Проверьте занятые порты:
```bash
sudo netstat -tulpn | grep -E ':(80|3001)'
```

2. Освободите порты или измените конфигурацию в `docker-compose.yml`

## 8. Обновление

### Обновление кода
```bash
cd /home/unitree/h1_site
sudo -u unitree git pull
sudo systemctl restart h1-docker
```

### Обновление Docker
```bash
sudo apt update
sudo apt upgrade docker-ce docker-ce-cli containerd.io
sudo systemctl restart docker
sudo systemctl restart h1-docker
```

## 9. Удаление

### Остановка и удаление сервиса
```bash
sudo systemctl stop h1-docker
sudo systemctl disable h1-docker
sudo rm /etc/systemd/system/h1-docker.service
sudo systemctl daemon-reload
```

### Удаление Docker
```bash
sudo apt purge docker-ce docker-ce-cli containerd.io
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd
```

### Удаление проекта и настроек
```bash
# Удаление проекта
sudo rm -rf /home/unitree/h1_site
sudo rm /home/unitree/h1_docker.log

# Удаление настроек пользователя
sudo deluser unitree docker
sudo deluser unitree video
sudo deluser unitree sudo
sudo rm /etc/sudoers.d/unitree
``` 