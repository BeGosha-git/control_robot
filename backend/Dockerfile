# Используем официальный образ Node.js
FROM node:18

# Устанавливаем sudo
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/*

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Создаем пользователя unitree и добавляем его в группу sudo
RUN useradd -m -s /bin/bash unitree && \
    echo "unitree ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/unitree && \
    chmod 0440 /etc/sudoers.d/unitree && \
    chown -R unitree:unitree /app

# Переключаемся на пользователя unitree
USER unitree

# Копируем исходный код
COPY server.js ./
COPY configs.conf ./

# Создаем директорию для файлов
RUN mkdir -p /app/test_files && \
    chmod 777 /app/test_files

# Открываем порты
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server.js"] 