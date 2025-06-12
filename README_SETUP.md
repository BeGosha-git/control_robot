# Установка и настройка H1 Robot

## Обзор

Этот проект содержит скрипты для установки и запуска системы управления роботом H1 на Debian.

## Структура файлов

- `setup.sh` - **Полная установка системы** (запускается один раз)
- `start_h1_unified.sh` - Запуск всех компонентов системы
- `stop_h1.sh` - Остановка всех компонентов системы
- `control_robot.service` - Файл системного сервиса

## Установка

### 1. Первоначальная установка системы

```bash
sudo ./setup.sh
```

Этот скрипт выполняет **полную установку системы**:
- Проверяет наличие Python3 и pip3
- Проверяет наличие Docker и Docker Compose
- Проверяет и настраивает Node.js/npm через nvm
- Устанавливает зависимости backend (npm install)
- **Создает виртуальное окружение Python (.venv)**
- **Устанавливает Python зависимости в виртуальном окружении**
- Создает необходимые директории и настраивает права доступа
- Устанавливает системный сервис `control_robot.service`
- Настраивает автозапуск
- Создает необходимые лог-файлы
- Устанавливает права на скрипты
- Настраивает маршрутизацию для робота H1
- Настраивает доступ к камере

### 2. Запуск системы

```bash
sudo ./start_h1_unified.sh
```

Этот скрипт **только запускает** уже установленную систему:
- Обновляет код из Git репозитория
- **Обновляет Python зависимости в виртуальном окружении**
- Останавливает существующие процессы
- Запускает backend, frontend и системный сервис
- Проверяет доступность сервисов

## Управление системой

### Запуск
```bash
sudo ./start_h1_unified.sh
```

### Остановка
```bash
./stop_h1.sh
```

### Управление системным сервисом

```bash
# Статус сервиса
sudo systemctl status control_robot

# Запуск сервиса
sudo systemctl start control_robot

# Остановка сервиса
sudo systemctl stop control_robot

# Перезапуск сервиса
sudo systemctl restart control_robot

# Просмотр логов
sudo journalctl -u control_robot -f

# Включение автозапуска
sudo systemctl enable control_robot

# Отключение автозапуска
sudo systemctl disable control_robot
```

### Просмотр логов

```bash
# Логи backend
tail -f /home/unitree/backend.log

# Логи frontend
docker compose logs -f

# Логи системного сервиса
sudo journalctl -u control_robot -f
```

## Доступ к приложению

После успешного запуска приложение будет доступно по адресам:

- **Frontend**: http://localhost
- **Backend API**: http://localhost:3001

## Требования

- Debian/Ubuntu система
- Права root для установки
- Интернет-соединение для загрузки зависимостей
- **Docker и Docker Compose** (должны быть установлены заранее)
- **Python3 и pip3** (должны быть установлены заранее)
- nvm (Node Version Manager) - для управления Node.js

## Устранение неполадок

### Проблемы с Python3
```bash
# Проверка версии Python3
python3 --version

# Установка Python3 (если не установлен)
sudo apt update
sudo apt install -y python3 python3-pip

# Проверка pip3
pip3 --version
```

### Проблемы с Docker
```bash
# Проверка статуса Docker
sudo systemctl status docker

# Установка Docker (если не установлен)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Перезапуск Docker
sudo systemctl restart docker
```

### Проблемы с Node.js/npm
```bash
# Проверка версий
sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && node --version"
sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && npm --version"

# Переустановка зависимостей backend
cd backend
sudo -u unitree bash -c "source /home/unitree/.nvm/nvm.sh && npm install"
```

### Проблемы с портами
```bash
# Проверка занятых портов
netstat -tuln | grep -E ":80|:3001"
```

### Переустановка системы
```bash
# Удаление старого сервиса
sudo systemctl stop control_robot
sudo systemctl disable control_robot
sudo rm /etc/systemd/system/control_robot.service
sudo systemctl daemon-reload

# Полная переустановка системы
sudo ./setup.sh
```

### Проблемы с правами доступа
```bash
# Если сервис не запускается из-за "Permission denied"
sudo chmod +x /home/unitree/control_robot/*.sh

# Установка правильного владельца
sudo chown unitree:unitree /home/unitree/control_robot/*.sh

# Перезапуск сервиса
sudo systemctl restart control_robot

# Проверка статуса
sudo systemctl status control_robot
```

**Примечание:** Права на скрипты автоматически устанавливаются после каждого обновления из Git в `start_h1_unified.sh`.

## Автоматический запуск

После установки системы через `setup.sh`, система будет автоматически запускаться при загрузке системы.

Для отключения автозапуска:
```bash
sudo systemctl disable control_robot
```

## Обновление

Для обновления системы:
```bash
sudo ./start_h1_unified.sh
```

Скрипт автоматически:
- Получит последние изменения из Git
- Перезапустит все компоненты
- Обновит системный сервис при необходимости

## Разделение ответственности

### `setup.sh` - Установка (один раз)
- Установка всех зависимостей
- Настройка системы
- Установка сервиса
- Первоначальная настройка

### `start_h1_unified.sh` - Запуск (каждый раз)
- Обновление кода
- Запуск сервисов
- Проверка работоспособности

Это разделение позволяет избежать бесконечного цикла установки и делает систему более надежной. 