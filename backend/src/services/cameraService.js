const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

class CameraService {
  constructor() {
    this.wss = null;
    this.isStreaming = false;
    this.frameInterval = null;
    this.frameRate = 30; // 30 FPS
    this.currentDevice = null;
    this.devices = [];
    this.deviceWatcher = null;
    this.deviceHandle = null;
    
    // Инициализация камер
    this.initCameras();
  }

  async initCameras() {
    try {
      // Получаем список камер через V4L2
      await this.updateDeviceList();

      // Создаем наблюдатель за устройствами
      this.deviceWatcher = setInterval(async () => {
        await this.updateDeviceList();
      }, 1000);

    } catch (error) {
      console.error('Ошибка инициализации камер:', error);
    }
  }

  async findVideoDevices() {
    return new Promise((resolve, reject) => {
      exec('ls -l /dev/video*', (error, stdout, stderr) => {
        if (error) {
          console.error('Ошибка поиска видеоустройств:', error);
          reject(error);
          return;
        }

        const devices = stdout.split('\n')
          .filter(line => line.trim() && line.includes('/dev/video'))
          .map(line => {
            const match = line.match(/\/dev\/video(\d+)/);
            return match ? `/dev/video${match[1]}` : null;
          })
          .filter(Boolean);

        resolve(devices);
      });
    });
  }

  async getDeviceInfo(devicePath) {
    return new Promise((resolve, reject) => {
      exec(`v4l2-ctl --device ${devicePath} --all`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Ошибка получения информации об устройстве ${devicePath}:`, error);
          reject(error);
          return;
        }

        const info = {
          path: devicePath,
          name: '',
          capabilities: [],
          formats: []
        };

        // Парсим вывод v4l2-ctl
        const lines = stdout.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          if (line.startsWith('Card type')) {
            info.name = line.split(':')[1].trim();
          } else if (line.includes('Capabilities')) {
            const caps = line.split(':')[1].trim().split(',');
            info.capabilities = caps.map(cap => cap.trim());
          } else if (line.includes('Pixel Format')) {
            const format = line.split(':')[1].trim();
            info.formats.push(format);
          }
        }

        resolve(info);
      });
    });
  }

  async updateDeviceList() {
    try {
      // Получаем список устройств
      const devicePaths = await this.findVideoDevices();
      const deviceInfos = await Promise.all(
        devicePaths.map(path => this.getDeviceInfo(path))
      );

      // Фильтруем только устройства с поддержкой захвата
      const newDevices = deviceInfos.filter(info => 
        info.capabilities.includes('Video Capture')
      );

      console.log(`Найдено ${newDevices.length} камер`);

      // Если это первое обнаружение камер или текущая камера отключена
      if (this.devices.length === 0 && newDevices.length > 0) {
        console.log('Устанавливаем первую камеру как активную');
        await this.setActiveCamera(0);
      } else if (this.currentDevice) {
        // Проверяем, не отключилась ли текущая камера
        const currentDeviceStillExists = newDevices.some(device => 
          device.path === this.currentDevice.path
        );
        
        if (!currentDeviceStillExists && newDevices.length > 0) {
          console.log('Текущая камера отключена, переключаемся на первую доступную');
          await this.setActiveCamera(0);
        }
      }

      this.devices = newDevices;

      // Обновляем список для клиентов
      if (this.wss) {
        const deviceList = this.getAvailableCameras();
        console.log('Отправляем список камер клиентам:', deviceList);
        
        this.wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({
              type: 'devices',
              devices: deviceList,
              activeCamera: this.currentDevice ? 
                this.devices.indexOf(this.currentDevice) : -1
            }));
          }
        });
      }
    } catch (error) {
      console.error('Ошибка при обновлении списка устройств:', error);
    }
  }

  async setActiveCamera(deviceIndex) {
    try {
      if (deviceIndex >= 0 && deviceIndex < this.devices.length) {
        console.log('Смена активной камеры на индекс:', deviceIndex);

        // Закрываем текущее устройство если оно открыто
        if (this.deviceHandle) {
          try {
            this.deviceHandle.close();
            this.deviceHandle = null;
          } catch (error) {
            console.error('Ошибка при закрытии предыдущей камеры:', error);
          }
        }

        // Устанавливаем новое устройство
        this.currentDevice = this.devices[deviceIndex];
        console.log('Новая камера:', this.currentDevice);

        // Настраиваем параметры камеры
        await this.configureDevice();

        // Обновляем список устройств для клиентов
        await this.updateDeviceList();

        console.log(`Активная камера изменена на: ${deviceIndex + 1}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Ошибка при смене камеры:', error);
      return false;
    }
  }

  async configureDevice() {
    if (!this.currentDevice) return;

    try {
      // Устанавливаем формат и разрешение
      await new Promise((resolve, reject) => {
        exec(`v4l2-ctl --device ${this.currentDevice.path} --set-fmt-video=width=640,height=480,pixelformat=YUYV`, (error) => {
          if (error) {
            console.error('Ошибка установки формата:', error);
            reject(error);
            return;
          }
          resolve();
        });
      });

      // Устанавливаем частоту кадров
      await new Promise((resolve, reject) => {
        exec(`v4l2-ctl --device ${this.currentDevice.path} --set-ctrl=fps=${this.frameRate}`, (error) => {
          if (error) {
            console.error('Ошибка установки частоты кадров:', error);
            reject(error);
            return;
          }
          resolve();
        });
      });

      console.log('Камера настроена');
    } catch (error) {
      console.error('Ошибка настройки камеры:', error);
      throw error;
    }
  }

  async captureFrame() {
    return new Promise((resolve, reject) => {
      if (!this.currentDevice) {
        console.log('Нет активной камеры, генерируем тестовый паттерн');
        const matrix = this.generateTestPattern();
        resolve(matrix);
        return;
      }

      try {
        // Читаем кадр из устройства
        exec(`v4l2-ctl --device ${this.currentDevice.path} --stream-mmap --stream-count=1 --stream-to=-`, 
          { maxBuffer: 1024 * 1024 * 10 }, // 10MB буфер
          (error, stdout, stderr) => {
            if (error) {
              console.error('Ошибка захвата кадра:', error);
              reject(error);
              return;
            }

            // Преобразуем YUYV в оттенки серого
            const buffer = Buffer.from(stdout);
            const matrix = this.yuyvToGrayscale(buffer, 640, 480);
            resolve(matrix);
          }
        );
      } catch (error) {
        console.error('Ошибка при работе с камерой:', error);
        reject(error);
      }
    });
  }

  yuyvToGrayscale(buffer, width, height) {
    const matrix = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 2;
        // В формате YUYV каждый пиксель занимает 2 байта
        // Y (яркость) находится в первом байте
        const y = buffer[i];
        row.push(y);
      }
      matrix.push(row);
    }
    return matrix;
  }

  // Генерация тестового паттерна
  generateTestPattern() {
    const width = 640;
    const height = 480;
    const matrix = [];
    
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const time = Date.now() / 1000;
        const value = Math.floor(
          (Math.sin(x/20 + time) + Math.cos(y/20 + time)) * 127 + 128
        );
        row.push(value);
      }
      matrix.push(row);
    }
    
    return matrix;
  }

  startStreaming(server) {
    if (this.isStreaming) return;

    this.wss = new WebSocketServer({ server });
    this.isStreaming = true;

    this.wss.on('connection', async (ws) => {
      console.log('Новое подключение к стриму камеры');

      // Функция отправки кадра
      const sendFrame = async () => {
        if (ws.readyState === ws.OPEN) {
          try {
            const frame = await this.captureFrame();
            ws.send(JSON.stringify({
              type: 'frame',
              data: frame,
              timestamp: Date.now()
            }));
          } catch (error) {
            console.error('Ошибка захвата кадра:', error);
          }
        }
      };

      // Отправляем кадры с заданной частотой
      this.frameInterval = setInterval(sendFrame, 1000 / this.frameRate);

      ws.on('close', () => {
        console.log('Клиент отключился от стрима');
        if (this.frameInterval) {
          clearInterval(this.frameInterval);
          this.frameInterval = null;
        }
      });
    });
  }

  stopStreaming() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    if (this.deviceWatcher) {
      clearInterval(this.deviceWatcher);
      this.deviceWatcher = null;
    }
    if (this.deviceHandle) {
      try {
        this.deviceHandle.close();
        this.deviceHandle = null;
      } catch (error) {
        console.error('Ошибка при закрытии устройства:', error);
      }
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.isStreaming = false;
  }

  // Получение списка доступных камер
  async getAvailableCameras() {
    return this.devices.map((device, index) => ({
      id: index,
      name: `${device.name} (${device.path})`,
      isActive: device === this.currentDevice,
      path: device.path,
      formats: device.formats
    }));
  }
}

module.exports = new CameraService(); 