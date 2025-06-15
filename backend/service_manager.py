#!/usr/bin/env python3
"""
Сервис-менеджер для автоматического управления Python сервисами
- Автозапуск всех .py файлов в папке сервисов
- Мониторинг Node.js сервера
- Проверка и создание виртуального окружения
- Автоматический перезапуск упавших сервисов
"""

import os
import sys
import time
import signal
import subprocess
import threading
import json
import requests
import logging
import asyncio
from pathlib import Path
from typing import Dict, Optional, List, Any
from dataclasses import dataclass
from datetime import datetime
import psutil
import socket
import urllib.request
import urllib.error

# Настройка логирования для контейнера
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Убираем файловое логирование для контейнера
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class ServiceInfo:
    """Информация о сервисе"""
    name: str
    file_path: str
    process: Optional[subprocess.Popen] = None
    pid: Optional[int] = None
    is_running: bool = False
    restart_count: int = 0
    max_restarts: int = 5
    last_start_time: Optional[datetime] = None
    last_restart: float = 0

class ServiceManager:
    """Менеджер сервисов с автоматическим управлением"""
    
    def __init__(self):
        self.services: Dict[str, ServiceInfo] = {}
        self.is_running = True
        self.monitoring_thread = None
        self.nodejs_monitoring_thread = None
        
        # Получаем пути из переменных окружения или используем по умолчанию
        self.services_dir = Path(os.environ.get('SERVICES_DIR', Path(__file__).parent / "src" / "services"))
        self.venv_path = Path(os.environ.get('VENV_PATH', Path(__file__).parent / "venv"))
        self.nodejs_port = int(os.environ.get('NODEJS_PORT', 3001))
        self.check_interval = int(os.environ.get('CHECK_INTERVAL', 5))
        
        # Создаем директорию сервисов если её нет
        self.services_dir.mkdir(parents=True, exist_ok=True)
        
        logger.warning(f"Сервис-менеджер инициализирован")
        logger.warning(f"Директория сервисов: {self.services_dir}")
        logger.warning(f"Путь к venv: {self.venv_path}")
        logger.warning(f"Порт Node.js: {self.nodejs_port}")
        logger.warning(f"Интервал проверки: {self.check_interval}с")

    def check_internet_connection(self) -> bool:
        """Проверка подключения к интернету с несколькими методами"""
        # Список URL для проверки
        test_urls = [
            'http://www.google.com',
            'http://www.cloudflare.com',
            'http://www.github.com',
            'http://www.python.org'
        ]
        
        for url in test_urls:
            try:
                urllib.request.urlopen(url, timeout=5)
                logger.debug(f"Интернет доступен через {url}")
                return True
            except (urllib.error.URLError, socket.timeout):
                continue
        
        # Если все URL недоступны, пробуем DNS
        try:
            socket.gethostbyname('google.com')
            logger.debug("DNS работает, но HTTP недоступен")
            return True
        except socket.gaierror:
            logger.warning("Нет подключения к интернету")
            return False

    def check_venv(self) -> bool:
        """Проверка существования виртуального окружения"""
        # Определяем путь к Python в зависимости от ОС
        if os.name == 'nt':  # Windows
            python_exe = self.venv_path / "Scripts" / "python.exe"
        else:  # Linux/Unix
            python_exe = self.venv_path / "bin" / "python"
        
        return python_exe.exists()

    def create_venv(self) -> bool:
        """Создание виртуального окружения"""
        try:
            logger.warning("Создание виртуального окружения...")
            
            # Ждем подключения к интернету
            retry_count = 0
            max_retries = 10
            while not self.check_internet_connection() and retry_count < max_retries:
                logger.warning(f"Нет подключения к интернету, ожидание... (попытка {retry_count + 1}/{max_retries})")
                time.sleep(30)
                retry_count += 1
            
            if not self.check_internet_connection():
                logger.error("Не удалось получить подключение к интернету для установки зависимостей")
                return False
            
            # Создаем venv
            subprocess.run([sys.executable, "-m", "venv", str(self.venv_path)], check=True)
            
            # Определяем пути к pip и python
            if os.name == 'nt':  # Windows
                pip_exe = self.venv_path / "Scripts" / "pip.exe"
                python_exe = self.venv_path / "Scripts" / "python.exe"
            else:  # Linux/Unix
                pip_exe = self.venv_path / "bin" / "pip"
                python_exe = self.venv_path / "bin" / "python"
            
            # Обновляем pip через python -m pip
            subprocess.run([str(python_exe), "-m", "pip", "install", "--upgrade", "pip"], check=True)
            
            # Устанавливаем пакеты из requirements.txt
            req_path = Path(__file__).parent / "requirements.txt"
            if req_path.exists():
                logger.warning(f"Установка зависимостей из {req_path}...")
                subprocess.run([str(pip_exe), "install", "-r", str(req_path)], check=True)
            else:
                logger.warning(f"Файл {req_path} не найден, зависимости не установлены!")
            
            logger.warning("Виртуальное окружение успешно создано")
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Ошибка при создании venv: {e}")
            return False
        except Exception as e:
            logger.error(f"Неожиданная ошибка при создании venv: {e}")
            return False

    def get_python_executable(self) -> str:
        """Получение пути к Python в venv"""
        if os.name == 'nt':  # Windows
            return str(self.venv_path / "Scripts" / "python.exe")
        else:  # Linux/Unix
            return str(self.venv_path / "bin" / "python")

    def discover_services(self) -> List[Path]:
        """Поиск всех .py файлов в директории сервисов"""
        services = []
        if self.services_dir.exists():
            try:
                # Используем os.listdir вместо glob для лучшей совместимости с кириллицей
                import os
                files = os.listdir(str(self.services_dir))
                
                for file_name in files:
                    if file_name.endswith('.py') and file_name != "__init__.py":
                        file_path = self.services_dir / file_name
                        services.append(file_path)
            except Exception as e:
                logger.error(f"Ошибка при поиске сервисов: {e}")
        else:
            logger.error(f"Директория не существует: {self.services_dir}")
        
        return services

    def check_nodejs_server(self) -> bool:
        """Проверка работы Node.js сервера с повторными попытками и логированием"""
        # Получаем URL из переменных окружения или используем по умолчанию
        nodejs_host = os.environ.get('NODEJS_HOST', 'localhost')
        nodejs_url = f"http://{nodejs_host}:{self.nodejs_port}/api/status"
        
        for attempt in range(3):
            try:
                response = requests.get(nodejs_url, timeout=10)
                # Считаем сервер доступным, если он отвечает (любой код ответа)
                # Сервер работает если отвечает, даже с 503 (Service Unavailable)
                logger.debug(f"Node.js сервер отвечает: {response.status_code}")
                return True
            except requests.exceptions.ConnectionError as e:
                logger.warning(f"Попытка {attempt+1}: Node.js не отвечает (ConnectionError): {e}")
            except requests.exceptions.Timeout as e:
                logger.warning(f"Попытка {attempt+1}: Node.js не отвечает (Timeout): {e}")
            except Exception as e:
                logger.warning(f"Попытка {attempt+1}: Node.js не отвечает: {e}")
            
            if attempt < 2:  # Не ждем после последней попытки
                time.sleep(2)
        
        logger.error(f"Node.js сервер не доступен после 3 попыток по адресу {nodejs_url}")
        return False

    def start_service(self, service_path: Path) -> bool:
        """Запуск сервиса"""
        service_name = service_path.stem
        
        # Проверяем, не запущен ли уже сервис
        if service_name in self.services and self.services[service_name].is_running:
            if self.services[service_name].pid and psutil.pid_exists(self.services[service_name].pid):
                # Проверяем, что процесс действительно работает
                try:
                    process = psutil.Process(self.services[service_name].pid)
                    if process.status() != psutil.STATUS_ZOMBIE:
                        logger.warning(f"Сервис {service_name} уже запущен (PID: {self.services[service_name].pid})")
                        return True
                except psutil.NoSuchProcess:
                    # Процесс не существует, сбрасываем флаг
                    self.services[service_name].is_running = False
                    self.services[service_name].pid = None
                    logger.warning(f"Процесс {service_name} не найден, перезапускаем...")
        
        try:
            # Освобождаем порт если нужно (для сервисов с фиксированными портами)
            self._kill_process_on_port_if_needed(service_path)
            
            # Запускаем процесс
            python_exe = self.get_python_executable()
            process = subprocess.Popen(
                [python_exe, str(service_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Ждем немного для инициализации
            time.sleep(2)
            
            # Проверяем, что процесс запустился
            if process.poll() is None:
                service_info = ServiceInfo(
                    name=service_name,
                    file_path=str(service_path),
                    process=process,
                    pid=process.pid,
                    is_running=True,
                    last_start_time=datetime.now()
                )
                self.services[service_name] = service_info
                logger.warning(f"Сервис {service_name} запущен (PID: {process.pid})")
                return True
            else:
                logger.error(f"Сервис {service_name} завершился сразу после запуска")
                return False
                
        except Exception as e:
            logger.error(f"Ошибка запуска сервиса {service_name}: {e}")
            return False

    def stop_service(self, service_name: str) -> bool:
        """Остановка сервиса"""
        if service_name not in self.services:
            return True
        
        service = self.services[service_name]
        
        if not service.is_running:
            return True
        
        try:
            if service.pid:
                process = psutil.Process(service.pid)
                process.terminate()
                
                try:
                    process.wait(timeout=5)
                except psutil.TimeoutExpired:
                    process.kill()
                    process.wait()
            
            service.is_running = False
            service.process = None
            service.pid = None
            logger.warning(f"Сервис {service_name} остановлен")
            return True
            
        except psutil.NoSuchProcess:
            service.is_running = False
            service.process = None
            service.pid = None
            return True
        except Exception as e:
            logger.error(f"Ошибка остановки сервиса {service_name}: {e}")
            return False

    def restart_service(self, service_name: str) -> bool:
        """Перезапуск сервиса"""
        if self.stop_service(service_name):
            time.sleep(1)
            service_path = Path(self.services[service_name].file_path)
            return self.start_service(service_path)
        return False

    def _kill_process_on_port_if_needed(self, service_path: Path):
        """Убивает процесс на порту если сервис использует фиксированный порт"""
        try:
            # Читаем файл сервиса для определения порта
            with open(service_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Ищем порт в коде (простая эвристика)
            import re
            port_match = re.search(r'port\s*=\s*(\d+)', content)
            if port_match:
                port = int(port_match.group(1))
                self._kill_process_on_port(port)
        except Exception as e:
            logger.warning(f"Не удалось определить порт для {service_path}: {e}")

    def _kill_process_on_port(self, port: int):
        """Принудительное завершение процесса на порту"""
        try:
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    connections = proc.net_connections()
                    for conn in connections:
                        if hasattr(conn, 'laddr') and conn.laddr.port == port:
                            proc.terminate()
                            proc.wait(timeout=3)
                            logger.warning(f"Процесс на порту {port} завершен")
                            return True
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired):
                    continue
        except Exception as e:
            logger.warning(f"Ошибка при завершении процесса на порту {port}: {e}")
        return False

    def monitor_services(self):
        """Мониторинг сервисов"""
        logger.warning("Запуск мониторинга сервисов...")
        
        while self.is_running:
            try:
                for service_name, service in list(self.services.items()):
                    if service.is_running and service.pid:
                        try:
                            process = psutil.Process(service.pid)
                            if process.status() == psutil.STATUS_ZOMBIE:
                                logger.warning(f"Процесс {service_name} стал зомби, перезапускаем...")
                                self.restart_service(service_name)
                        except psutil.NoSuchProcess:
                            logger.warning(f"Процесс {service_name} (PID: {service.pid}) не найден, перезапускаем...")
                            service.is_running = False
                            service.pid = None
                            
                            # Проверяем лимит перезапусков
                            if service.restart_count < service.max_restarts:
                                service.restart_count += 1
                                service.last_restart = time.time()
                                service_path = Path(service.file_path)
                                self.start_service(service_path)
                            else:
                                logger.error(f"Превышен лимит перезапусков для сервиса {service_name}")
                        except Exception as e:
                            logger.error(f"Ошибка мониторинга сервиса {service_name}: {e}")
                
                time.sleep(self.check_interval)
                
            except Exception as e:
                logger.error(f"Ошибка в мониторинге сервисов: {e}")
                time.sleep(self.check_interval)

    def monitor_nodejs_server(self):
        """Мониторинг Node.js сервера"""
        logger.warning("Запуск мониторинга Node.js сервера...")
        
        while self.is_running:
            try:
                nodejs_running = self.check_nodejs_server()
                
                if nodejs_running:
                    # Node.js работает — запускаем сервисы только если они не запущены
                    running_services = sum(1 for service in self.services.values() if service.is_running)
                    if running_services == 0:
                        logger.warning("Node.js сервер запущен, запускаем сервисы...")
                        self.start_all_services()
                    else:
                        # Убираем отладочное сообщение
                        pass
                else:
                    # Node.js не работает — останавливаем все сервисы
                    if any(service.is_running for service in self.services.values()):
                        logger.warning("Node.js сервер остановлен, останавливаем все сервисы...")
                        self.stop_all_services()
                
                time.sleep(self.check_interval)
                
            except Exception as e:
                logger.error(f"Ошибка в мониторинге Node.js сервера: {e}")
                time.sleep(self.check_interval)

    def start_all_services(self):
        """Запуск всех сервисов"""
        logger.warning("Запуск всех сервисов...")
        
        # Обновляем список сервисов
        service_files = self.discover_services()
        
        if not service_files:
            logger.warning("Не найдено ни одного .py файла в директории сервисов")
            return
        
        started_count = 0
        skipped_count = 0
        for service_path in service_files:
            service_name = service_path.stem
            
            # Проверяем, не запущен ли уже сервис
            if service_name in self.services and self.services[service_name].is_running:
                if self.services[service_name].pid and psutil.pid_exists(self.services[service_name].pid):
                    skipped_count += 1
                    continue
            
            if self.start_service(service_path):
                started_count += 1
            else:
                logger.error(f"Не удалось запустить сервис {service_path.name}")
        
        if started_count > 0 or skipped_count > 0:
            logger.warning(f"Запущено {started_count}, пропущено {skipped_count} сервисов")

    def stop_all_services(self):
        """Остановка всех сервисов"""
        logger.warning("Остановка всех сервисов...")
        
        stopped_count = 0
        for service_name in list(self.services.keys()):
            if self.stop_service(service_name):
                stopped_count += 1
        
        if stopped_count > 0:
            logger.warning(f"Остановлено {stopped_count} сервисов")

    def cleanup_services_state(self):
        """Очистка состояния сервисов - сброс флагов для несуществующих процессов"""
        logger.warning("Очистка состояния сервисов...")
        cleaned_count = 0
        
        for service_name, service in list(self.services.items()):
            if service.is_running and service.pid:
                try:
                    process = psutil.Process(service.pid)
                    if process.status() == psutil.STATUS_ZOMBIE:
                        logger.warning(f"Сервис {service_name} имеет зомби-процесс, сбрасываем состояние")
                        service.is_running = False
                        service.pid = None
                        cleaned_count += 1
                except psutil.NoSuchProcess:
                    logger.warning(f"Процесс {service_name} (PID: {service.pid}) не найден, сбрасываем состояние")
                    service.is_running = False
                    service.pid = None
                    cleaned_count += 1
        
        if cleaned_count > 0:
            logger.warning(f"Очищено состояние {cleaned_count} сервисов")

    def run(self):
        """Основной цикл работы"""
        logger.warning("Запуск сервис-менеджера...")
        
        # Проверяем и создаем venv
        if not self.check_venv():
            logger.warning("Виртуальное окружение не найдено, создаем...")
            if not self.create_venv():
                logger.error("Не удалось создать виртуальное окружение")
                return
        
        # Очищаем состояние сервисов при запуске
        self.cleanup_services_state()
        
        # Принудительно запускаем сервисы сразу при старте
        logger.warning("Запуск сервисов при старте...")
        self.start_all_services()
        
        # Запускаем мониторинг Node.js сервера в отдельном потоке
        self.nodejs_monitoring_thread = threading.Thread(target=self.monitor_nodejs_server, daemon=True)
        self.nodejs_monitoring_thread.start()
        
        # Запускаем мониторинг сервисов в отдельном потоке
        self.monitoring_thread = threading.Thread(target=self.monitor_services, daemon=True)
        self.monitoring_thread.start()
        
        try:
            # Основной цикл
            while self.is_running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.warning("Получен сигнал прерывания...")
        finally:
            self.shutdown()

    def shutdown(self):
        """Корректное завершение работы"""
        logger.warning("Завершение работы сервис-менеджера...")
        self.is_running = False
        
        # Останавливаем все сервисы
        self.stop_all_services()
        
        # Ждем завершения потоков
        if self.monitoring_thread:
            self.monitoring_thread.join(timeout=5)
        if self.nodejs_monitoring_thread:
            self.nodejs_monitoring_thread.join(timeout=5)
        
        logger.warning("Сервис-менеджер остановлен")

def signal_handler(signum, frame):
    """Обработчик сигналов для graceful shutdown"""
    logger.warning(f"Получен сигнал {signum}, завершение работы...")
    if 'manager' in globals():
        manager.shutdown()
    sys.exit(0)

if __name__ == "__main__":
    # Регистрируем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Логируем переменные окружения
    logger.warning("Переменные окружения:")
    logger.warning(f"  SERVICES_DIR: {os.environ.get('SERVICES_DIR', 'не установлена')}")
    logger.warning(f"  VENV_PATH: {os.environ.get('VENV_PATH', 'не установлена')}")
    logger.warning(f"  NODEJS_HOST: {os.environ.get('NODEJS_HOST', 'localhost')}")
    logger.warning(f"  NODEJS_PORT: {os.environ.get('NODEJS_PORT', '3001')}")
    logger.warning(f"  CHECK_INTERVAL: {os.environ.get('CHECK_INTERVAL', '5')}")
    
    try:
        # Создаем и запускаем менеджер
        manager = ServiceManager()
        manager.run()
    except KeyboardInterrupt:
        logger.warning("Получен KeyboardInterrupt, завершение работы...")
    except Exception as e:
        logger.error(f"Критическая ошибка: {e}")
    finally:
        if 'manager' in locals():
            manager.shutdown() 