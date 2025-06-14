# Быстрый запуск H1 Robot Control System

## 🚀 Автоматический запуск

```bash
sudo ./start_h1_unified.sh
```

Этот скрипт автоматически:
- Проверит и установит все зависимости
- Создаст виртуальное окружение Python
- Запустит Python сервис камер
- Запустит Node.js сервер
- Запустит React фронтенд в Docker

## 📱 Доступ к приложению

После запуска система будет доступна по адресам:
- **Фронтенд**: http://localhost
- **Backend API**: http://localhost:3001  
- **Python сервис камер**: http://localhost:5000

## 🌐 Сетевая настройка

Система автоматически настраивает маршрутизацию для робота H1:
```bash
# Автоматически выполняется при запуске
sudo ip route add default via 192.168.123.1
```

## 🎥 Работа с камерами

1. Откройте http://localhost
2. Перейдите в раздел "Камеры"
3. Нажмите "Запустить все камеры"
4. Наслаждайтесь стримом со всех доступных камер!

## 🛑 Остановка системы

```bash
./stop_h1.sh
```

Или нажмите `Ctrl+C` в терминале где запущен `start_h1_unified.sh`

## 🔧 Ручной запуск (если нужно)

### 1. Python сервис камер
```bash
cd backend/src/services
source .venv/bin/activate
python camera_service.py
```

### 2. Node.js сервер (в новом терминале)
```bash
cd backend
npm start
```

### 3. React фронтенд (в новом терминале)
```bash
# Запуск через Docker (рекомендуется)
docker compose up -d

# Или ручной запуск (если npm установлен)
cd frontend
npm start
```

## 🐛 Устранение неполадок

### Камеры не обнаружены
- Убедитесь, что USB камеры подключены
- Проверьте права доступа к устройствам

### Ошибки Python
```bash
cd backend/src/services
source .venv/bin/activate
pip install -r ../../requirements.txt
```

### Ошибки Node.js
```bash
cd backend && npm install
cd frontend && npm install
```

### Порт занят
- Остановите другие процессы на портах 3001, 5000
- Или измените порты в конфигурации

### Проблемы с сетью
```bash
# Проверка маршрутизации
ip route show

# Ручная настройка маршрута
sudo ip route add default via 192.168.123.1

# Проверка связи с роботом
ping 192.168.123.1
```

## 📋 Требования

- Python 3.7+
- Node.js 16.8+
- Docker (для frontend)
- USB камеры (для работы с видео)
- Debian/Ubuntu (рекомендуется) или Windows

## 📋 Что делает скрипт
1. Проверяет подключение к интернету
2. Обновляет проект из Git (если есть интернет)
3. Создает и активирует виртуальное окружение Python
4. Устанавливает зависимости backend (если нужно и есть интернет)
5. Настраивает маршрутизацию для робота H1
6. Запускает backend на хосте
7. Запускает frontend в Docker контейнере
8. Проверяет доступность сервисов

## 🌐 Режимы работы
- **С интернетом**: Полная установка, обновление и умная пересборка Docker
- **Без интернета**: Запуск с уже установленными зависимостями

## 🐳 Docker логика
- **Frontend**: Собирается в контейнере, npm не нужен на хосте
- **Пересборка**: Только при изменениях в frontend и наличии интернета
- **Офлайн**: Использует существующие образы без пересборки

## 🔧 Управление
```bash
# Логи backend
tail -f /home/unitree/backend.log

# Логи frontend
docker compose logs -f

# Перезапуск
sudo ./start_h1_unified.sh

# Обновление из Git
sudo ./start_h1_unified.sh --update
```

## 🚀 Системный сервис

Для автоматического запуска при загрузке системы:
```bash
# Установка сервиса
sudo systemctl enable control_robot

# Запуск сервиса
sudo systemctl start control_robot

# Проверка статуса
sudo systemctl status control_robot

# Просмотр логов
sudo journalctl -u control_robot -f
```

---
**Подробная документация**: [README.md](README.md) 