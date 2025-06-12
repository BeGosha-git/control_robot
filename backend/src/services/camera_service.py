import cv2
import json
import time
import threading
import base64
import numpy as np
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import logging
import os
import signal
import sys

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CameraService:
    def __init__(self):
        self.cameras = {}
        self.camera_threads = {}
        self.is_running = False
        self.frame_rate = 30
        self.resolution = (640, 480)
        self.fallback_frame = None  # Белый фон для fallback
        
    def create_fallback_frame(self):
        """Создание белого фона для fallback"""
        if self.fallback_frame is None:
            # Создаем белый кадр
            white_frame = np.ones((self.resolution[1], self.resolution[0], 3), dtype=np.uint8) * 255
            # Добавляем текст
            cv2.putText(white_frame, "No Camera Available", (50, 240), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
            # Конвертируем в JPEG
            _, buffer = cv2.imencode('.jpg', white_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            self.fallback_frame = base64.b64encode(buffer).decode('utf-8')
        return self.fallback_frame
        
    def discover_cameras(self):
        """Обнаружение всех доступных камер"""
        available_cameras = []
        
        # Проверяем камеры с индексами от 0 до 9
        for i in range(10):
            try:
                cap = cv2.VideoCapture(i)
                if cap.isOpened():
                    ret, frame = cap.read()
                    if ret:
                        # Получаем информацию о камере
                        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        
                        camera_info = {
                            'id': i,
                            'name': f'Камера {i}',
                            'width': width,
                            'height': height,
                            'fps': fps,
                            'is_active': False
                        }
                        available_cameras.append(camera_info)
                        logger.info(f"Найдена камера {i}: {width}x{height} @ {fps}fps")
                    
                    cap.release()
            except Exception as e:
                logger.warning(f"Ошибка при проверке камеры {i}: {e}")
                continue
        
        return available_cameras
    
    def start_camera_stream(self, camera_id):
        """Запуск стрима с камеры"""
        if camera_id in self.cameras:
            logger.warning(f"Камера {camera_id} уже запущена")
            return False
            
        try:
            cap = cv2.VideoCapture(camera_id)
            if not cap.isOpened():
                logger.error(f"Не удалось открыть камеру {camera_id}")
                return False
            
            # Настройка параметров камеры
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
            cap.set(cv2.CAP_PROP_FPS, self.frame_rate)
            
            self.cameras[camera_id] = {
                'capture': cap,
                'is_active': True,
                'last_frame': None,
                'last_frame_time': 0
            }
            
            # Запуск потока для чтения кадров
            thread = threading.Thread(target=self._camera_worker, args=(camera_id,))
            thread.daemon = True
            thread.start()
            self.camera_threads[camera_id] = thread
            
            logger.info(f"Запущен стрим с камеры {camera_id}")
            return True
        except Exception as e:
            logger.error(f"Ошибка при запуске камеры {camera_id}: {e}")
            return False
    
    def stop_camera_stream(self, camera_id):
        """Остановка стрима с камеры"""
        if camera_id not in self.cameras:
            return False
            
        self.cameras[camera_id]['is_active'] = False
        
        # Ждем завершения потока
        if camera_id in self.camera_threads:
            self.camera_threads[camera_id].join(timeout=1.0)
            del self.camera_threads[camera_id]
        
        # Закрываем захват
        if self.cameras[camera_id]['capture']:
            self.cameras[camera_id]['capture'].release()
        
        del self.cameras[camera_id]
        logger.info(f"Остановлен стрим с камеры {camera_id}")
        return True
    
    def _camera_worker(self, camera_id):
        """Рабочий поток для чтения кадров с камеры"""
        camera = self.cameras[camera_id]
        cap = camera['capture']
        
        while camera['is_active']:
            try:
                ret, frame = cap.read()
                if ret:
                    # Конвертируем в JPEG
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    jpeg_data = base64.b64encode(buffer).decode('utf-8')
                    
                    camera['last_frame'] = jpeg_data
                    camera['last_frame_time'] = time.time()
                else:
                    logger.warning(f"Не удалось прочитать кадр с камеры {camera_id}")
                    
                time.sleep(1.0 / self.frame_rate)
                
            except Exception as e:
                logger.error(f"Ошибка в потоке камеры {camera_id}: {e}")
                break
        
        logger.info(f"Поток камеры {camera_id} завершен")
    
    def get_camera_frame(self, camera_id):
        """Получение последнего кадра с камеры"""
        if camera_id not in self.cameras:
            return None
            
        camera = self.cameras[camera_id]
        if camera['last_frame'] is None:
            return None
            
        return {
            'camera_id': camera_id,
            'frame': camera['last_frame'],
            'timestamp': camera['last_frame_time']
        }
    
    def get_all_frames(self):
        """Получение кадров со всех активных камер"""
        frames = []
        for camera_id in self.cameras:
            frame_data = self.get_camera_frame(camera_id)
            if frame_data:
                frames.append(frame_data)
        return frames
    
    def get_fallback_frame(self):
        """Получение fallback кадра (белый фон)"""
        return {
            'camera_id': -1,
            'frame': self.create_fallback_frame(),
            'timestamp': time.time(),
            'is_fallback': True
        }
    
    def start_all_cameras(self):
        """Запуск всех доступных камер"""
        cameras = self.discover_cameras()
        started_count = 0
        
        for camera in cameras:
            if self.start_camera_stream(camera['id']):
                started_count += 1
        
        logger.info(f"Запущено {started_count} камер из {len(cameras)} доступных")
        return started_count
    
    def stop_all_cameras(self):
        """Остановка всех камер"""
        camera_ids = list(self.cameras.keys())
        logger.info(f"Останавливаем {len(camera_ids)} камер...")
        
        for camera_id in camera_ids:
            try:
                self.stop_camera_stream(camera_id)
            except Exception as e:
                logger.error(f"Ошибка при остановке камеры {camera_id}: {e}")
        
        # Ждем завершения всех потоков
        for thread_id, thread in list(self.camera_threads.items()):
            try:
                if thread.is_alive():
                    thread.join(timeout=2.0)
                    if thread.is_alive():
                        logger.warning(f"Поток камеры {thread_id} не завершился в течение 2 секунд")
            except Exception as e:
                logger.error(f"Ошибка при ожидании завершения потока {thread_id}: {e}")
        
        # Очищаем словари
        self.cameras.clear()
        self.camera_threads.clear()
        
        logger.info("Все камеры остановлены")

# Создаем экземпляр сервиса
camera_service = CameraService()

# Создаем Flask приложение
app = Flask(__name__)
CORS(app)

@app.route('/api/status', methods=['GET'])
def status():
    """Статус сервиса"""
    return jsonify({
        'status': 'ok',
        'active_cameras': len(camera_service.cameras),
        'total_cameras': len(camera_service.discover_cameras())
    })

@app.route('/api/cameras', methods=['GET'])
def get_cameras():
    """Получение списка всех доступных камер"""
    cameras = camera_service.discover_cameras()
    
    # Отмечаем активные камеры
    for camera in cameras:
        camera['is_active'] = camera['id'] in camera_service.cameras
    
    return jsonify({
        'cameras': cameras,
        'active_count': len(camera_service.cameras)
    })

@app.route('/api/camera/<int:camera_id>/start', methods=['POST'])
def start_camera(camera_id):
    """Запуск камеры"""
    success = camera_service.start_camera_stream(camera_id)
    if success:
        return jsonify({'status': 'ok', 'message': f'Камера {camera_id} запущена'})
    else:
        return jsonify({'status': 'error', 'message': f'Не удалось запустить камеру {camera_id}'}), 400

@app.route('/api/camera/<int:camera_id>/stop', methods=['POST'])
def stop_camera(camera_id):
    """Остановка камеры"""
    success = camera_service.stop_camera_stream(camera_id)
    if success:
        return jsonify({'status': 'ok', 'message': f'Камера {camera_id} остановлена'})
    else:
        return jsonify({'status': 'error', 'message': f'Камера {camera_id} не найдена'}), 404

@app.route('/api/camera/<int:camera_id>/frame', methods=['GET'])
def get_camera_frame(camera_id):
    """Получение кадра с конкретной камеры"""
    frame_data = camera_service.get_camera_frame(camera_id)
    if frame_data:
        return jsonify(frame_data)
    else:
        # Возвращаем fallback кадр если камера не найдена
        return jsonify(camera_service.get_fallback_frame())

@app.route('/api/cameras/frames', methods=['GET'])
def get_all_frames():
    """Получение кадров со всех активных камер"""
    frames = camera_service.get_all_frames()
    if not frames:
        # Если нет активных камер, возвращаем fallback кадр
        frames = [camera_service.get_fallback_frame()]
    
    return jsonify({
        'frames': frames,
        'count': len(frames),
        'timestamp': time.time()
    })

@app.route('/api/cameras/start-all', methods=['POST'])
def start_all_cameras():
    """Запуск всех доступных камер"""
    started_count = camera_service.start_all_cameras()
    return jsonify({
        'status': 'ok',
        'started_count': started_count,
        'message': f'Запущено {started_count} камер'
    })

@app.route('/api/cameras/stop-all', methods=['POST'])
def stop_all_cameras():
    """Остановка всех камер"""
    camera_service.stop_all_cameras()
    return jsonify({
        'status': 'ok',
        'message': 'Все камеры остановлены'
    })

@app.route('/api/cameras/stream', methods=['GET'])
def stream_frames():
    """Стрим кадров со всех камер в реальном времени"""
    def generate():
        while True:
            frames = camera_service.get_all_frames()
            if not frames:
                # Если нет активных камер, отправляем fallback кадр
                frames = [camera_service.get_fallback_frame()]
            
            data = {
                'type': 'frames',
                'frames': frames,
                'timestamp': time.time()
            }
            yield f"data: {json.dumps(data)}\n\n"
            
            time.sleep(1.0 / 30)  # 30 FPS
    
    return Response(generate(), mimetype='text/plain')

if __name__ == '__main__':
    # Обработчики сигналов для корректного завершения
    def signal_handler(signum, frame):
        print(f"\nПолучен сигнал {signum}, останавливаем сервер...")
        try:
            camera_service.stop_all_cameras()
            print("Все камеры остановлены")
        except Exception as e:
            print(f"Ошибка при остановке камер: {e}")
        finally:
            print("Завершение работы сервиса")
            sys.exit(0)
    
    # Регистрируем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Проверяем наличие доступных камер перед запуском
    available_cameras = camera_service.discover_cameras()
    
    if len(available_cameras) == 0:
        logger.warning("Нет доступных камер. Сервис запускается с fallback режимом.")
        print("ВНИМАНИЕ: Сервис запущен в fallback режиме (белый фон).")
        print("   Используйте API для ручного управления камерами.")
    else:
        logger.info(f"Найдено {len(available_cameras)} камер. Запускаем все доступные камеры...")
        print(f"Найдено {len(available_cameras)} камер. Запускаем все доступные камеры...")
        # Автоматически запускаем все доступные камеры при старте
        started_count = camera_service.start_all_cameras()
        print(f"Запущено {started_count} камер из {len(available_cameras)} доступных")
    
    # Запускаем Flask сервер
    print("Запуск веб-сервера на http://localhost:5000")
    try:
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\nПолучен сигнал прерывания, останавливаем сервер...")
        camera_service.stop_all_cameras()
        sys.exit(0)
    except Exception as e:
        print(f"Ошибка запуска сервера: {e}")
        camera_service.stop_all_cameras()
        sys.exit(1) 