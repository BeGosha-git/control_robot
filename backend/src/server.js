const express = require('express');
const http = require('http');
const cors = require('cors');
const cameraService = require('./services/cameraService');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Запускаем стрим камеры
cameraService.startStreaming(server);

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok' });
});

// Получение списка доступных камер
app.get('/api/cameras', async (req, res) => {
  try {
    const cameras = await cameraService.getAvailableCameras();
    res.json({ cameras });
  } catch (error) {
    console.error('Ошибка получения списка камер:', error);
    res.status(500).json({ error: 'Не удалось получить список камер' });
  }
});

// Установка активной камеры
app.post('/api/camera', async (req, res) => {
  try {
    const { deviceIndex } = req.body;
    if (typeof deviceIndex !== 'number') {
      return res.status(400).json({ error: 'Неверный индекс камеры' });
    }

    const success = await cameraService.setActiveCamera(deviceIndex);
    if (success) {
      res.json({ status: 'ok' });
    } else {
      res.status(400).json({ error: 'Не удалось установить камеру' });
    }
  } catch (error) {
    console.error('Ошибка установки камеры:', error);
    res.status(500).json({ error: 'Ошибка установки камеры' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
}); 