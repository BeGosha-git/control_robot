# Control Robot

Веб-интерфейс для создания и редактирования файлов движений робота H1 с использованием Docker.

## Функциональность

- 3D визуализация робота H1 с возможностью вращения и масштабирования
- Блочный редактор кода для создания последовательности движений
- Сохранение файлов движений в формате .cpp
- Поддержка всех стандартных движений из шаблона
- Контейнеризация с помощью Docker для простой установки и запуска
- Системный сервис для автоматического запуска

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

Скрипт автоматически:
- Установит Docker и Docker Compose (если отсутствуют)
- Настроит необходимые права доступа
- Установит и запустит системный сервис
- Запустит Docker контейнеры
- Проверит доступ к камере

Приложение будет доступно по адресам:
- Frontend: http://localhost
- Backend API: http://localhost:3001

## Управление сервисом

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

## Устранение неполадок

1. Проверка логов сервиса:
```bash
sudo journalctl -u control_robot -f
```

2. Перезапуск сервиса:
```bash
sudo systemctl restart control_robot
```

3. Остановка и отключение сервиса:
```bash
sudo systemctl stop control_robot
sudo systemctl disable control_robot
sudo rm /etc/systemd/system/control_robot.service
```

4. Проверка статуса Docker контейнеров:
```bash
docker ps
docker-compose ps
```

5. Перезапуск контейнеров:
```bash
cd /home/unitree/control_robot
docker-compose down
docker-compose up -d
```

## Структура проекта

```
.
├── frontend/              # React приложение
│   ├── src/              # Исходный код
│   ├── Dockerfile        # Конфигурация Docker для фронтенда
│   └── nginx.conf        # Конфигурация Nginx
├── backend/              # Node.js сервер
│   ├── src/             # Исходный код
│   ├── Dockerfile       # Конфигурация Docker для бэкенда
│   └── package.json     # Зависимости Node.js
├── docker compose.yml    # Конфигурация Docker Compose
├── install.sh           # Скрипт установки
├── start_h1.sh         # Скрипт запуска
├── install_service.sh   # Скрипт установки системного сервиса
└── README.md
```

## Разработка

### Локальная разработка без Docker

1. Запустите бэкенд:
```bash
cd backend
npm install
npm start
```

2. В отдельном терминале запустите фронтенд:
```bash
cd frontend
npm install
npm start
```

### Разработка с Docker

1. Сборка и запуск контейнеров:
```bash
docker compose up --build
```

2. Просмотр логов:
```bash
docker compose logs -f
```

3. Остановка контейнеров:
```bash
docker compose down
```

## Сетевая настройка

Для работы с роботом может потребоваться настройка маршрутизации:
```bash
sudo ip route add default via 192.168.123.1
```

## Лицензия

MIT

---

**Проект поддерживает кроссплатформенную работу (Windows, Linux) через Docker.**






**НЬЮАНСЫ**

sudo ip route add default via 192.168.123.1
