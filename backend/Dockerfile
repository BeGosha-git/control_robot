FROM python:3.9-slim

# Устанавливаем системные зависимости для OpenCV и сервис-менеджера
RUN apt-get update && apt-get install -y \
    # Зависимости для OpenCV
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgstreamer1.0-0 \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    gstreamer1.0-x \
    gstreamer1.0-alsa \
    gstreamer1.0-gl \
    gstreamer1.0-gtk3 \
    gstreamer1.0-qt5 \
    gstreamer1.0-pulseaudio \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libv4l-dev \
    libxvidcore-dev \
    libx264-dev \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libatlas-base-dev \
    gfortran \
    # Зависимости для сервис-менеджера
    curl \
    && rm -rf /var/lib/apt/lists/*

# Создаем рабочую директорию
WORKDIR /app

# Копируем requirements
COPY requirements.txt .

# Устанавливаем Python зависимости
RUN pip install uv
RUN uv pip install --system --no-cache-dir -r requirements.txt

# Копируем код сервис-менеджера
COPY service_manager.py .

# Копируем код сервиса камер
COPY src/services/camera_service.py ./camera_service.py

# Создаем пользователя для безопасности
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Открываем порты
EXPOSE 5000 5002

# Запускаем сервис-менеджер (он сам запустит камеру)
CMD ["python", "service_manager.py"] 