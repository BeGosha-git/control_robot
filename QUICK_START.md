# Быстрый запуск H1 Robot Control

## 🚀 Запуск (одной командой)
```bash
sudo ./start_h1_unified.sh
```

## 🛑 Остановка
```bash
./stop_h1.sh
```

## 📱 Доступ к приложению
- **Frontend**: http://localhost
- **Backend API**: http://localhost:3001

## 📋 Что делает скрипт
1. Обновляет проект из Git (сохраняя configs.conf)
2. Устанавливает зависимости (Docker, Node.js, npm)
3. Запускает backend на хосте
4. Запускает frontend в Docker контейнере
5. Проверяет доступность сервисов

## 🔧 Управление
```bash
# Логи backend
tail -f /home/unitree/backend.log

# Логи frontend
docker compose logs -f

# Перезапуск
sudo ./start_h1_unified.sh
```

---
**Подробная документация**: [README.md](README.md) 