#!/usr/bin/env python3
"""
Сервис камер для H1 робота
Обеспечивает обнаружение, управление и стриминг с камер
"""

import cv2
import asyncio
import time
import threading
import numpy as np
from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import logging
import os
import signal
import sys
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field
from queue import Queue, Empty, Full
import uvicorn
from concurrent.futures import ThreadPoolExecutor
import json
import base64
from datetime import datetime, timedelta

# Единая конфигурация стримов для всего приложения
STREAM_CONFIGS = [
    {
        'name': 'Экстримальное качество',
        'quality': 5,
        'fps': 10,
        'description': '10 FPS, качество 5%'
    },
    {
        'name': 'Низкое качество',
        'quality': 20,
        'fps': 30,
        'description': '20 FPS, качество 10%'
    },
    {
        'name': 'Стандартное качество', 
        'quality': 50,
        'fps': 30,
        'description': '30 FPS, качество 50%'
    },
    {
        'name': 'Высокое качество',
        'quality': 85,
        'fps': 60,
        'description': '60 FPS, качество 85%'
    }
]

# Настройка логирования для контейнера (только stdout)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Убираем файловое логирование для контейнера
    ]
)
logger = logging.getLogger(__name__)

# Глобальная переменная для graceful shutdown
shutdown_event = threading.Event()

@dataclass
class CameraInfo:
    """Информация о камере"""
    id: int
    name: str
    width: int = 640
    height: int = 480
    fps: float = 30.0
    is_active: bool = False
    is_fallback: bool = False
    backend: str = "auto"
    last_frame_time: Optional[float] = None
    error_count: int = 0
    service_info: str = "disconnected"

@dataclass
class CameraFrame:
    """Кадр с камеры"""
    camera_id: int
    jpeg_data: bytes
    timestamp: float
    width: int
    height: int
    is_fallback: bool = False
    error: Optional[str] = None

class CameraStream:
    """Оптимизированный поток для чтения кадров с камеры"""
    
    def __init__(self, camera_id: int, resolution: tuple = (640, 480), fps: float = 30.0):
        self.camera_id = camera_id
        self.resolution = resolution
        self.fps = fps
        self.is_running = False
        self.capture = None
        self.frame_queue = Queue(maxsize=1)  # Уменьшаем размер очереди до 1
        self.last_frame: Optional[CameraFrame] = None
        self.thread: Optional[threading.Thread] = None
        self.error_count = 0
        self.max_errors = 5  # Уменьшаем количество ошибок
        self.backend = None
        self.last_frame_time = 0
        self.lock = threading.Lock()  # Добавляем блокировку
        self.stop_event = threading.Event()  # Событие для остановки
        
    def _try_backends(self) -> Optional[cv2.VideoCapture]:
        """Попытка открыть камеру с разными backend'ами для Linux"""
        # Linux backends для контейнера
        backends = [
            (cv2.CAP_V4L2, "Video4Linux2"),  # Основной Linux backend
            (cv2.CAP_ANY, "Auto"),           # Автоматический выбор
            (cv2.CAP_V4L, "Video4Linux"),    # Старый Linux backend
        ]
        
        for backend_id, backend_name in backends:
            try:
                cap = cv2.VideoCapture(self.camera_id, backend_id)
                
                if cap.isOpened():
                    # Пробуем прочитать кадр для проверки
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        self.backend = backend_name
                        logger.info(f"Камера {self.camera_id} открыта с backend {backend_name}")
                        return cap
                    else:
                        logger.warning(f"Камера {self.camera_id} открыта, но не может читать кадры с backend {backend_name}")
                        cap.release()
                else:
                    logger.warning(f"Не удалось открыть камеру {self.camera_id} с backend {backend_name}")
                    
            except Exception as e:
                logger.warning(f"Ошибка при открытии камеры {self.camera_id} с backend {backend_name}: {e}")
                continue
        
        return None
    
    def start(self) -> bool:
        """Запуск потока камеры"""
        with self.lock:
            if self.is_running:
                return True
            try:
                self.stop_event.clear()
                self.capture = self._try_backends()
                if self.capture is None:
                    logger.error(f"Не удалось открыть камеру {self.camera_id}")
                    return False
                # Настройка параметров камеры
                self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
                self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
                self.capture.set(cv2.CAP_PROP_FPS, self.fps)
                self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self.is_running = True
                self.thread = threading.Thread(target=self._read_frames, daemon=True)
                self.thread.start()
                return True
            except Exception as e:
                logger.error(f"Ошибка запуска потока камеры {self.camera_id}: {e}")
                return False
    
    def stop(self):
        """Остановка потока камеры"""
        with self.lock:
            if not self.is_running:
                return
            self.is_running = False
            self.stop_event.set()
            # Останавливаем поток
            if self.thread and self.thread.is_alive():
                self.thread.join(timeout=3.0)
            # Закрываем capture
            if self.capture:
                try:
                    self.capture.release()
                except Exception as e:
                    logger.warning(f"Ошибка при закрытии камеры {self.camera_id}: {e}")
                finally:
                    self.capture = None
            # Очищаем очередь
            while not self.frame_queue.empty():
                try:
                    self.frame_queue.get_nowait()
                except Empty:
                    break
    
    def _read_frames(self):
        """Постоянное чтение кадров в отдельном потоке с автоматическим перезапуском камеры"""
        frame_interval = max(0.01, 1.0 / self.fps)
        consecutive_errors = 0
        max_consecutive_errors = 10
        
        while self.is_running and not self.stop_event.is_set():
            try:
                if self.capture is None or not self.capture.isOpened():
                    logger.warning(f"Камера {self.camera_id} недоступна, пытаемся переподключиться...")
                    consecutive_errors += 1
                    if consecutive_errors >= max_consecutive_errors:
                        logger.error(f"Слишком много ошибок с камеры {self.camera_id}, перезапускаем камеру...")
                        self._restart_camera()
                        consecutive_errors = 0
                    time.sleep(1.0)
                    continue
                
                # Безопасное чтение кадра с обработкой OpenCV ошибок
                try:
                    ret, frame = self.capture.read()
                except Exception as opencv_error:
                    logger.error(f"OpenCV ошибка при чтении кадра с камеры {self.camera_id}: {opencv_error}")
                    self.error_count += 1
                    consecutive_errors += 1
                    
                    # При критических ошибках OpenCV перезапускаем камеру
                    if consecutive_errors >= max_consecutive_errors:
                        logger.error(f"Критическая ошибка OpenCV с камеры {self.camera_id}, перезапускаем камеру...")
                        self._restart_camera()
                        consecutive_errors = 0
                    
                    time.sleep(0.5)
                    continue
                
                if ret and frame is not None:
                    self.error_count = 0
                    consecutive_errors = 0
                    
                    # Безопасное кодирование в JPEG
                    try:
                        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 85]
                        _, buffer = cv2.imencode('.jpg', frame, encode_param)
                        jpeg_data = buffer.tobytes()
                    except Exception as encode_error:
                        logger.error(f"Ошибка кодирования JPEG для камеры {self.camera_id}: {encode_error}")
                        time.sleep(0.1)
                        continue
                    
                    camera_frame = CameraFrame(
                        camera_id=self.camera_id,
                        jpeg_data=jpeg_data,
                        timestamp=time.time(),
                        width=frame.shape[1],
                        height=frame.shape[0]
                    )
                    
                    # Очищаем очередь и добавляем новый кадр
                    while not self.frame_queue.empty():
                        try:
                            self.frame_queue.get_nowait()
                        except Empty:
                            break
                    
                    try:
                        self.frame_queue.put(camera_frame, block=False)
                        self.last_frame = camera_frame
                        self.last_frame_time = camera_frame.timestamp
                    except Full:
                        self.last_frame = camera_frame
                        self.last_frame_time = camera_frame.timestamp
                else:
                    self.error_count += 1
                    consecutive_errors += 1
                    logger.warning(f"Не удалось прочитать кадр с камеры {self.camera_id} (ошибка #{self.error_count}, последовательных: {consecutive_errors})")
                    
                    if consecutive_errors >= max_consecutive_errors:
                        logger.error(f"Слишком много последовательных ошибок с камеры {self.camera_id}, перезапускаем камеру...")
                        self._restart_camera()
                        consecutive_errors = 0
                    
                    time.sleep(0.1)
                    continue
                
                time.sleep(frame_interval)
                
            except Exception as e:
                self.error_count += 1
                consecutive_errors += 1
                logger.error(f"Общая ошибка в потоке камеры {self.camera_id}: {e}")
                
                # При любых критических ошибках пытаемся перезапустить камеру
                if consecutive_errors >= max_consecutive_errors:
                    logger.error(f"Критическая ошибка с камеры {self.camera_id}, перезапускаем камеру...")
                    try:
                        self._restart_camera()
                        consecutive_errors = 0
                    except Exception as restart_error:
                        logger.error(f"Не удалось перезапустить камеру {self.camera_id}: {restart_error}")
                
                time.sleep(0.5)
    
    def _restart_camera(self):
        """Перезапуск камеры при проблемах"""
        try:
            # Закрываем текущий capture
            if self.capture:
                try:
                    self.capture.release()
                except Exception as e:
                    logger.warning(f"Ошибка при закрытии камеры {self.camera_id}: {e}")
                finally:
                    self.capture = None
            
            # Увеличиваем паузу перед перезапуском для стабильности
            time.sleep(1.0)
            
            # Пытаемся открыть камеру заново с обработкой ошибок
            try:
                self.capture = self._try_backends()
                if self.capture is None:
                    logger.error(f"Не удалось перезапустить камеру {self.camera_id}")
                    return False
                
                # Настройка параметров камеры с проверкой
                try:
                    self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
                    self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
                    self.capture.set(cv2.CAP_PROP_FPS, self.fps)
                    self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception as e:
                    logger.warning(f"Не удалось установить параметры камеры {self.camera_id}: {e}")
                
                # Проверяем, что камера работает
                try:
                    ret, test_frame = self.capture.read()
                    if not ret or test_frame is None:
                        logger.error(f"Камера {self.camera_id} не может читать кадры после перезапуска")
                        self.capture.release()
                        self.capture = None
                        return False
                except Exception as e:
                    logger.error(f"Ошибка тестирования камеры {self.camera_id} после перезапуска: {e}")
                    if self.capture:
                        self.capture.release()
                        self.capture = None
                    return False
                
                return True
                
            except Exception as e:
                logger.error(f"Ошибка при открытии камеры {self.camera_id} после перезапуска: {e}")
                return False
            
        except Exception as e:
            logger.error(f"Критическая ошибка при перезапуске камеры {self.camera_id}: {e}")
            return False
    
    def get_frame(self) -> Optional[CameraFrame]:
        """Получение последнего кадра"""
        if not self.is_running:
            return self.last_frame
        
        try:
            return self.frame_queue.get_nowait()
        except Empty:
            return self.last_frame

class CameraService:
    """Оптимизированный сервис управления камерами"""
    
    def __init__(self):
        self.cameras: Dict[int, CameraInfo] = {}
        self.streams: Dict[int, CameraStream] = {}
        self.fallback_frame: Optional[bytes] = None
        self.discovery_cache: List[CameraInfo] = []
        self.last_discovery_time = 0
        self.cache_ttl = 30  # секунд
        self.resolution = (640, 480)
        self.default_fps = 30.0
        
        # Автоматический запуск всех камер при старте сервиса
        self.auto_start_cameras()
        
        # Запуск автоматической очистки кэша каждые 5 секунд
        self.start_cache_cleanup_thread()
    
    def start_cache_cleanup_thread(self):
        """Запуск потока для автоматической очистки кэша стримов"""
        def cleanup_worker():
            while True:
                try:
                    time.sleep(5)  # Пауза 5 секунд
                    self.cleanup_stream_cache()
                except Exception as e:
                    logger.error(f"Ошибка в потоке очистки кэша: {e}")
        
        cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        cleanup_thread.start()
        logger.info("Запущен поток автоматической очистки кэша стримов (каждые 5 секунд)")
    
    def cleanup_stream_cache(self):
        """Очистка кэша стримов"""
        try:
            # Очищаем очереди кадров в потоках
            for stream in self.streams.values():
                if hasattr(stream, 'frame_queue'):
                    while not stream.frame_queue.empty():
                        try:
                            stream.frame_queue.get_nowait()
                        except Empty:
                            break
            
            # Очищаем fallback кадр если он старый
            if self.fallback_frame:
                self.fallback_frame = None
            
            logger.debug("Автоматическая очистка кэша стримов выполнена")
        except Exception as e:
            logger.error(f"Ошибка при автоматической очистке кэша стримов: {e}")
    
    def auto_start_cameras(self):
        """Автоматический запуск всех доступных камер при старте сервиса"""
        cameras = self.discover_cameras(force=True)
        started_count = 0
        
        for camera in cameras:
            if not camera.is_fallback:  # Пропускаем fallback камеру
                if self.start_camera(camera.id):
                    started_count += 1
        
    def create_fallback_frame(self) -> bytes:
        """Создание fallback кадра"""
        if self.fallback_frame is None:
            # Создаем белый кадр с текстом
            white_frame = np.ones((self.resolution[1], self.resolution[0], 3), dtype=np.uint8) * 255
            
            # Добавляем текст
            font = cv2.FONT_HERSHEY_SIMPLEX
            text = "Камера недоступна"
            text_size = cv2.getTextSize(text, font, 1, 2)[0]
            text_x = (self.resolution[0] - text_size[0]) // 2
            text_y = (self.resolution[1] + text_size[1]) // 2
            
            cv2.putText(white_frame, text, (text_x, text_y), font, 1, (0, 0, 0), 2)
            
            # Конвертируем в JPEG
            _, buffer = cv2.imencode('.jpg', white_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            self.fallback_frame = buffer.tobytes()
        
        return self.fallback_frame
    
    def discover_cameras(self, force: bool = False) -> List[CameraInfo]:
        """Обнаружение доступных камер"""
        now = time.time()
        if not force and self.discovery_cache and (now - self.last_discovery_time < self.cache_ttl):
            return self.discovery_cache.copy()
        
        available_cameras = []
        
        # Проверяем камеры с ID от 0 до 9
        for i in range(10):
            try:
                cap = cv2.VideoCapture(i)
                if cap.isOpened():
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        
                        camera_info = CameraInfo(
                            id=i,
                            name=f'Камера {i}',
                            width=width,
                            height=height,
                            fps=fps if fps > 0 else self.default_fps,
                            is_active=i in self.cameras,
                            service_info="available"
                        )
                        available_cameras.append(camera_info)
                    
                    cap.release()
            except Exception as e:
                logger.debug(f"Ошибка при проверке камеры {i}: {e}")
                continue
        
        # Добавляем fallback камеру если нет реальных камер
        if not available_cameras:
            fallback_camera = CameraInfo(
                id=-1,
                name='Виртуальная камера',
                width=self.resolution[0],
                height=self.resolution[1],
                fps=self.default_fps,
                is_active=-1 in self.cameras,
                is_fallback=True,
                service_info="fallback"
            )
            available_cameras.append(fallback_camera)
        
        self.discovery_cache = available_cameras
        self.last_discovery_time = now
        
        return available_cameras.copy()
    
    def restart_camera(self, camera_id: int) -> bool:
        """Принудительный перезапуск камеры"""
        if camera_id not in self.cameras:
            logger.warning(f"Камера {camera_id} не найдена для перезапуска")
            return False
        
        if camera_id not in self.streams:
            logger.warning(f"Поток камеры {camera_id} не найден для перезапуска")
            return False
        
        try:
            # Останавливаем текущий поток
            self.streams[camera_id].stop()
            
            # Небольшая пауза
            time.sleep(0.5)
            
            # Создаем новый поток
            new_stream = CameraStream(camera_id, self.resolution, self.default_fps)
            
            if new_stream.start():
                self.streams[camera_id] = new_stream
                self.cameras[camera_id].is_active = True
                self.cameras[camera_id].service_info = "active"
                return True
            else:
                logger.error(f"Не удалось перезапустить камеру {camera_id}")
                return False
                
        except Exception as e:
            logger.error(f"Ошибка при принудительном перезапуске камеры {camera_id}: {e}")
            return False
    
    def start_camera(self, camera_id: int) -> bool:
        """Запуск камеры"""
        if camera_id in self.cameras:
            logger.warning(f"Камера {camera_id} уже запущена")
            return True
        
        # Специальная обработка для fallback камеры
        if camera_id == -1:
            self.cameras[camera_id] = CameraInfo(
                id=camera_id,
                name='Виртуальная камера',
                width=self.resolution[0],
                height=self.resolution[1],
                fps=self.default_fps,
                is_active=True,
                is_fallback=True,
                service_info="active"
            )
            return True
        
        # Создаем поток для камеры
        stream = CameraStream(camera_id, self.resolution, self.default_fps)
        
        if stream.start():
            self.streams[camera_id] = stream
            self.cameras[camera_id] = CameraInfo(
                id=camera_id,
                name=f'Камера {camera_id}',
                width=self.resolution[0],
                height=self.resolution[1],
                fps=self.default_fps,
                is_active=True,
                service_info="active"
            )
            return True
        else:
            logger.error(f"Не удалось запустить камеру {camera_id}")
            return False
    
    def stop_camera(self, camera_id: int) -> bool:
        """Остановка камеры"""
        if camera_id not in self.cameras:
            return False
        
        # Останавливаем поток
        if camera_id in self.streams:
            self.streams[camera_id].stop()
            del self.streams[camera_id]
        
        # Удаляем из списка камер
        del self.cameras[camera_id]
        
        return True
    
    def get_camera_frame(self, camera_id: int) -> Optional[CameraFrame]:
        """Получение кадра с камеры с оптимизированной обработкой ошибок"""
        if camera_id not in self.cameras:
            return None
        
        camera = self.cameras[camera_id]
        
        # Для fallback камеры возвращаем статичный кадр
        if camera.is_fallback:
            fallback_data = self.create_fallback_frame()
            return CameraFrame(
                camera_id=camera_id,
                jpeg_data=fallback_data,
                timestamp=time.time(),
                width=camera.width,
                height=camera.height,
                is_fallback=True
            )
        
        # Получаем кадр из потока с таймаутом
        if camera_id in self.streams:
            try:
                frame = self.streams[camera_id].get_frame()
                if frame and frame.jpeg_data:
                    return frame
            except Exception as e:
                logger.warning(f"Ошибка получения кадра с камеры {camera_id}: {e}")
        
        return None
    
    def get_all_frames(self) -> List[CameraFrame]:
        """Получение кадров со всех активных камер"""
        frames = []
        for camera_id in self.cameras:
            frame = self.get_camera_frame(camera_id)
            if frame:
                frames.append(frame)
        return frames
    
    def start_all_cameras(self) -> int:
        """Запуск всех доступных камер"""
        cameras = self.discover_cameras(force=True)
        started_count = 0
        
        for camera in cameras:
            if self.start_camera(camera.id):
                started_count += 1
        
        return started_count
    
    def stop_all_cameras(self):
        """Остановка всех камер"""
        camera_ids = list(self.cameras.keys())
        
        for camera_id in camera_ids:
            try:
                self.stop_camera(camera_id)
            except Exception as e:
                logger.error(f"Ошибка при остановке камеры {camera_id}: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """Получение статуса сервиса"""
        return {
            "active_cameras": len(self.cameras),
            "total_cameras": len(self.discover_cameras()),
            "uptime": time.time() - self.last_discovery_time,
            "cameras": [
                {
                    "id": cam.id,
                    "name": cam.name,
                    "is_active": cam.is_active,
                    "service_info": cam.service_info,
                    "error_count": cam.error_count
                }
                for cam in self.cameras.values()
            ]
        }

# Создаем экземпляр сервиса
camera_service = CameraService()

# Создаем FastAPI приложение
app = FastAPI(title="Camera Service", version="3.0.0")

# Добавляем CORS с улучшенными настройками для веб-приложений
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Type", "Content-Length", "Cache-Control", "X-Accel-Buffering"]
)

# Pydantic модели
class CameraResponse(BaseModel):
    cameras: List[Dict[str, Any]]
    active_count: int

class CameraServiceInfoResponse(BaseModel):
    service_info: str
    active_cameras: int
    total_cameras: int
    uptime: float

class StartAllResponse(BaseModel):
    status: str
    started_count: int
    message: str

class StopAllResponse(BaseModel):
    status: str
    message: str

class CameraActionResponse(BaseModel):
    status: str
    message: str

@app.get("/api/cameras/streams/config")
async def get_streams_config():
    """Получение конфигурации постоянных стримов"""
    return {
        'permanent_streams': STREAM_CONFIGS,
        'total_configs': len(STREAM_CONFIGS),
        'instructions': 'Для добавления нового стрима отредактируйте список STREAM_CONFIGS в camera_service.py'
    }

@app.get("/api/cameras/{camera_id}/mjpeg")
async def mjpeg_stream(camera_id: int, quality: int = 85, fps: int = 30):
    """Постоянный MJPEG стрим для конкретной камеры с настраиваемым качеством и FPS (ухудшение кадра на лету)"""
    quality = max(10, min(100, quality))
    fps = max(1, min(60, fps))

    async def generate():
        try:
            target_interval = max(0.033, 1.0 / fps)
            last_frame_time = 0
            frame_count = 0
            max_frames_without_data = 50
            fallback_sent = False
            cleanup_counter = 0  # Счетчик для очистки кэша
            
            while True:
                try:
                    current_time = time.time()
                    frame_data = camera_service.get_camera_frame(camera_id)
                    
                    # Очистка кэша каждые 10 кадров
                    cleanup_counter += 1
                    if cleanup_counter >= 10:
                        camera_service.cleanup_stream_cache()
                        cleanup_counter = 0
                    
                    if frame_data and frame_data.jpeg_data:
                        frame_count = 0
                        fallback_sent = False
                        # Если нужно ухудшить качество, перекодируем JPEG -> numpy -> JPEG
                        if quality != 85:
                            try:
                                nparr = np.frombuffer(frame_data.jpeg_data, np.uint8)
                                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                                if img is not None:
                                    # Улучшение резкости и контрастности для низкого качества
                                    if quality < 30:
                                        # Увеличиваем контрастность
                                        img = cv2.convertScaleAbs(img, alpha=1.5, beta=10)
                                        
                                        # Применяем фильтр резкости (kernel для увеличения резкости)
                                        kernel = np.array([[-1,-1,-1],
                                                          [-1, 9,-1],
                                                          [-1,-1,-1]])
                                        img = cv2.filter2D(img, -1, kernel)
                                        
                                        # Дополнительное улучшение резкости через unsharp mask
                                        gaussian = cv2.GaussianBlur(img, (0, 0), 2.0)
                                        img = cv2.addWeighted(img, 1.5, gaussian, -0.5, 0)
                                        
                                        # Нормализация значений пикселей
                                        img = np.clip(img, 0, 255).astype(np.uint8)
                                    
                                    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
                                    _, buffer = cv2.imencode('.jpg', img, encode_param)
                                    jpeg_data = buffer.tobytes()
                                else:
                                    jpeg_data = frame_data.jpeg_data
                            except Exception as e:
                                logger.warning(f"Ошибка перекодирования кадра для камеры {camera_id}: {e}")
                                jpeg_data = frame_data.jpeg_data
                        else:
                            jpeg_data = frame_data.jpeg_data
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + jpeg_data + b'\r\n')
                        last_frame_time = current_time
                    else:
                        frame_count += 1
                        if frame_count > max_frames_without_data or not fallback_sent:
                            fallback_frame = camera_service.create_fallback_frame()
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + fallback_frame + b'\r\n')
                            fallback_sent = True
                            if frame_count > max_frames_without_data * 2:
                                logger.warning(f"Камера {camera_id} недоступна долгое время, пытаемся перезапустить...")
                                try:
                                    camera_service.restart_camera(camera_id)
                                    frame_count = 0
                                except Exception as e:
                                    logger.error(f"Ошибка при перезапуске камеры {camera_id}: {e}")
                        else:
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + b'\r\n')
                    elapsed = time.time() - current_time
                    sleep_time = max(0.001, target_interval - elapsed)
                    if sleep_time > 0:
                        await asyncio.sleep(sleep_time)
                    else:
                        await asyncio.sleep(0.001)
                except Exception as e:
                    logger.error(f"Ошибка в MJPEG стриме камеры {camera_id}: {e}")
                    try:
                        fallback_frame = camera_service.create_fallback_frame()
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + fallback_frame + b'\r\n')
                    except Exception:
                        pass
                    await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Критическая ошибка в MJPEG стриме камеры {camera_id}: {e}")

    return StreamingResponse(
        generate(),
        media_type='multipart/x-mixed-replace; boundary=frame',
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Content-Disposition': 'inline'
        }
    )

# Обработчики сигналов для корректного завершения
def signal_handler(signum, frame):
    logger.warning(f"Получен сигнал {signum}, останавливаем сервер...")
    try:
        # Устанавливаем флаг shutdown
        shutdown_event.set()
        
        # Останавливаем все камеры
        camera_service.stop_all_cameras()
        logger.warning("Все камеры остановлены")
    except Exception as e:
        logger.error(f"Ошибка при остановке камер: {e}")
    finally:
        logger.warning("Завершение работы сервиса")
        sys.exit(0)

# Регистрируем обработчики сигналов
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

if __name__ == "__main__":
    import uvicorn
    
    # Получаем порт из переменной окружения или используем по умолчанию
    port = int(os.environ.get('CAMERA_SERVICE_PORT', 5002))
    host = os.environ.get('CAMERA_SERVICE_HOST', '0.0.0.0')
    
    logger.warning(f"Запуск веб-сервера на http://{host}:{port}")
    logger.warning(f"Переменные окружения: CAMERA_SERVICE_PORT={port}, CAMERA_SERVICE_HOST={host}")
    
    try:
        uvicorn.run(
            app, 
            host=host, 
            port=port,
            log_level="info",
            access_log=True
        )
    except KeyboardInterrupt:
        logger.warning("Получен KeyboardInterrupt, завершение работы...")
    except Exception as e:
        logger.error(f"Ошибка запуска сервера: {e}")
    finally:
        signal_handler(signal.SIGTERM, None) 