# Этап сборки
FROM node:18-alpine as builder

WORKDIR /app

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --force

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Этап production
FROM nginx:alpine

# Создаем страницу ошибки
RUN echo '<!DOCTYPE html><html><head><title>Error</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:50px}h1{color:#333}</style></head><body><h1>500 Internal Server Error</h1><p>Something went wrong. Please try again later.</p></body></html>' > /usr/share/nginx/html/50x.html

# Копируем собранное приложение из этапа сборки
COPY --from=builder /app/build /usr/share/nginx/html

# Копируем конфигурацию nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Создаем директорию для логов и устанавливаем права
RUN mkdir -p /var/log/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Открываем порт
EXPOSE 80

# Запускаем nginx
CMD ["nginx", "-g", "daemon off;"] 