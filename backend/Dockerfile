# Используем официальный образ Node.js
FROM node:18

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходные файлы
COPY server.js ./
COPY configs.conf ./

# Создаем директорию для тестовых файлов
RUN mkdir -p /app/test_files

# Открываем порт
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server.js"] 