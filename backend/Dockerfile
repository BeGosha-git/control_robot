# Используем официальный образ Node.js
FROM node:18

# Устанавливаем sudo
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/*

# Создаем пользователя unitree и добавляем его в группу sudo
RUN useradd -m -s /bin/bash unitree && \
    echo "unitree ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/unitree && \
    chmod 0440 /etc/sudoers.d/unitree

# Создаем рабочую директорию и устанавливаем права
WORKDIR /app
RUN chown -R unitree:unitree /app

# Переключаемся на пользователя unitree
USER unitree

# Копируем файлы package.json и устанавливаем зависимости
COPY --chown=unitree:unitree package*.json ./
RUN npm install

# Копируем остальные файлы
COPY --chown=unitree:unitree server.js ./
COPY --chown=unitree:unitree configs.conf ./

# Создаем директорию для тестовых файлов с правильными правами
RUN mkdir -p /app/test_files && \
    chown -R unitree:unitree /app/test_files && \
    chmod 755 /app/test_files

# Открываем порты
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server.js"] 