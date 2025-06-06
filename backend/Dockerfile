# Используем официальный образ Node.js
FROM node:18

# Создаем рабочую директорию
WORKDIR /app

# Создаем директорию для исходного кода
RUN mkdir -p /app/src

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Остальные файлы будут монтироваться через volume
# COPY . .

# Создаем директорию для файлов
RUN mkdir -p /app/test_files && \
    chmod 777 /app/test_files

# Открываем порты
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server.js"] 