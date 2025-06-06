# Используем официальный образ Node.js
FROM node:18-slim

# Создаем рабочую директорию
WORKDIR /app

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

# Явно указываем entrypoint
ENTRYPOINT ["node"]
CMD ["server.js"] 