#!/usr/bin/env python3
"""
Главный скрипт для запуска всей системы H1 Robot Control
"""

import subprocess
import sys
import os
import time
import signal
import threading
from pathlib import Path

class SystemManager:
    def __init__(self):
        self.processes = {}
        self.running = False
        
    def start_python_camera_service(self):
        """Запуск Python сервиса камер"""
        print("🚀 Запуск Python сервиса камер...")
        service_path = Path("backend/src/services/camera_service.py")
        
        if not service_path.exists():
            print(f"❌ Файл сервиса не найден: {service_path}")
            return False
        
        # Определяем путь к виртуальному окружению
        venv_python = Path("backend/src/services/.venv/bin/python")
        if not venv_python.exists():
            # Пробуем Windows путь
            venv_python = Path("backend/src/services/.venv/Scripts/python.exe")
        
        # Используем виртуальное окружение если оно существует, иначе системный Python
        python_executable = str(venv_python) if venv_python.exists() else sys.executable
        
        if venv_python.exists():
            print(f"✅ Используется виртуальное окружение: {python_executable}")
        else:
            print(f"⚠️ Виртуальное окружение не найдено, используется системный Python: {python_executable}")
            
        try:
            process = subprocess.Popen(
                [python_executable, str(service_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            self.processes['camera_service'] = process
            print(f"✅ Python сервис камер запущен (PID: {process.pid})")
            return True
        except Exception as e:
            print(f"❌ Ошибка запуска Python сервиса: {e}")
            return False
    
    def start_node_server(self):
        """Запуск Node.js сервера"""
        print("🚀 Запуск Node.js сервера...")
        backend_path = Path("backend")
        
        if not backend_path.exists():
            print(f"❌ Директория backend не найдена: {backend_path}")
            return False
            
        try:
            process = subprocess.Popen(
                ["npm", "start"],
                cwd=backend_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            self.processes['node_server'] = process
            print(f"✅ Node.js сервер запущен (PID: {process.pid})")
            return True
        except Exception as e:
            print(f"❌ Ошибка запуска Node.js сервера: {e}")
            return False
    
    def start_frontend(self):
        """Запуск фронтенда"""
        print("🚀 Запуск фронтенда...")
        frontend_path = Path("frontend")
        
        if not frontend_path.exists():
            print(f"❌ Директория frontend не найдена: {frontend_path}")
            return False
            
        try:
            process = subprocess.Popen(
                ["npm", "start"],
                cwd=frontend_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            self.processes['frontend'] = process
            print(f"✅ Фронтенд запущен (PID: {process.pid})")
            return True
        except Exception as e:
            print(f"❌ Ошибка запуска фронтенда: {e}")
            return False
    
    def check_dependencies(self):
        """Проверка зависимостей"""
        print("🔍 Проверка зависимостей...")
        
        # Проверка Python зависимостей
        try:
            import cv2
            import flask
            print("✅ Python зависимости установлены")
        except ImportError as e:
            print(f"❌ Отсутствуют Python зависимости: {e}")
            print("Установите зависимости: pip install -r backend/requirements.txt")
            return False
        
        # Проверка Node.js
        try:
            result = subprocess.run(["node", "--version"], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ Node.js найден: {result.stdout.strip()}")
            else:
                print("❌ Node.js не найден")
                return False
        except FileNotFoundError:
            print("❌ Node.js не установлен")
            return False
        
        # Проверка npm
        try:
            result = subprocess.run(["npm", "--version"], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ npm найден: {result.stdout.strip()}")
            else:
                print("❌ npm не найден")
                return False
        except FileNotFoundError:
            print("❌ npm не установлен")
            return False
        
        return True
    
    def install_dependencies(self):
        """Установка зависимостей"""
        print("📦 Установка зависимостей...")
        
        # Установка Python зависимостей
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"], 
                         check=True)
            print("✅ Python зависимости установлены")
        except subprocess.CalledProcessError as e:
            print(f"❌ Ошибка установки Python зависимостей: {e}")
            return False
        
        # Установка Node.js зависимостей для backend
        try:
            subprocess.run(["npm", "install"], cwd="backend", check=True)
            print("✅ Backend зависимости установлены")
        except subprocess.CalledProcessError as e:
            print(f"❌ Ошибка установки backend зависимостей: {e}")
            return False
        
        # Установка Node.js зависимостей для frontend
        try:
            subprocess.run(["npm", "install"], cwd="frontend", check=True)
            print("✅ Frontend зависимости установлены")
        except subprocess.CalledProcessError as e:
            print(f"❌ Ошибка установки frontend зависимостей: {e}")
            return False
        
        return True
    
    def start_system(self):
        """Запуск всей системы"""
        print("🎯 Запуск системы H1 Robot Control...")
        
        # Проверка зависимостей
        if not self.check_dependencies():
            print("❌ Зависимости не установлены. Устанавливаем...")
            if not self.install_dependencies():
                print("❌ Не удалось установить зависимости")
                return False
        
        # Запуск сервисов
        success = True
        
        if not self.start_python_camera_service():
            success = False
        
        time.sleep(2)  # Даем время Python сервису запуститься
        
        if not self.start_node_server():
            success = False
        
        time.sleep(2)  # Даем время Node.js серверу запуститься
        
        if not self.start_frontend():
            success = False
        
        if success:
            self.running = True
            print("\n🎉 Система успешно запущена!")
            print("📱 Фронтенд: http://localhost:3000")
            print("🔧 Backend API: http://localhost:3001")
            print("📷 Python сервис камер: http://localhost:5000")
            print("\nДля остановки нажмите Ctrl+C")
            
            # Ожидание сигнала остановки
            try:
                while self.running:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n🛑 Получен сигнал остановки...")
                self.stop_system()
        else:
            print("❌ Не удалось запустить все сервисы")
            self.stop_system()
    
    def stop_system(self):
        """Остановка всей системы"""
        print("🛑 Остановка системы...")
        self.running = False
        
        for name, process in self.processes.items():
            if process and process.poll() is None:
                print(f"🛑 Остановка {name}...")
                try:
                    process.terminate()
                    process.wait(timeout=5)
                    print(f"✅ {name} остановлен")
                except subprocess.TimeoutExpired:
                    print(f"⚠️ Принудительная остановка {name}...")
                    process.kill()
                    process.wait()
                except Exception as e:
                    print(f"❌ Ошибка остановки {name}: {e}")
        
        self.processes.clear()
        print("✅ Система остановлена")

def main():
    manager = SystemManager()
    
    # Обработка сигналов для корректной остановки
    def signal_handler(signum, frame):
        print(f"\n📡 Получен сигнал {signum}")
        manager.stop_system()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Запуск системы
    manager.start_system()

if __name__ == '__main__':
    main() 