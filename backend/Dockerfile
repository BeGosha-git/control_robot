# Используем официальный образ Node.js
FROM node:18

# Создаем рабочую директорию
WORKDIR /app

# Создаем entrypoint скрипт
RUN echo '#!/bin/sh\nnode server.js' > /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY server.js ./
COPY configs.conf ./

# Создаем директорию для файлов
RUN mkdir -p /app/test_files && \
    chmod 777 /app/test_files

# Открываем порты
EXPOSE 3001

# Устанавливаем entrypoint
ENTRYPOINT ["docker-entrypoint.sh"] 