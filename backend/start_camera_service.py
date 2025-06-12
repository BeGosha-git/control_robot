#!/usr/bin/env python3
"""
Скрипт для запуска сервиса камер
"""

import sys
import os
import subprocess
import time
import cv2

def check_camera_access():
    """Проверка доступа к камерам"""
    print("Проверка доступа к камерам...")
    
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
                        'fps': fps
                    }
                    available_cameras.append(camera_info)
                    print(f"OK: Найдена камера {i}: {width}x{height} @ {fps}fps")
                else:
                    print(f"ОШИБКА: Камера {i}: не удалось прочитать кадр")
                
                cap.release()
            else:
                print(f"ОШИБКА: Камера {i}: недоступна")
                
        except Exception as e:
            print(f"ОШИБКА: Ошибка при проверке камеры {i}: {e}")
    
    print(f"\nВсего найдено доступных камер: {len(available_cameras)}")
    
    if len(available_cameras) == 0:
        print("НЕТ ДОСТУПНЫХ КАМЕР. Сервис не будет запущен.")
        return False
    
    print("Доступные камеры найдены. Запускаем сервис...")
    return True

def main():
    # Проверяем доступ к камерам
    if not check_camera_access():
        print("Сервис камер не запущен из-за отсутствия доступных камер.")
        sys.exit(1)
    
    # Путь к сервису камер
    service_path = os.path.join(os.path.dirname(__file__), 'src', 'services', 'camera_service.py')
    
    # Определяем путь к виртуальному окружению
    venv_python = os.path.join(os.path.dirname(__file__), 'src', 'services', '.venv', 'bin', 'python')
    if not os.path.exists(venv_python):
        # Пробуем Windows путь
        venv_python = os.path.join(os.path.dirname(__file__), 'src', 'services', '.venv', 'Scripts', 'python.exe')
    
    # Используем виртуальное окружение если оно существует, иначе системный Python
    python_executable = venv_python if os.path.exists(venv_python) else sys.executable
    
    if os.path.exists(venv_python):
        print(f"Используется виртуальное окружение: {python_executable}")
        # Проверяем, что виртуальное окружение работает
        try:
            result = subprocess.run([python_executable, "-c", "import sys; print('Python path:', sys.executable)"], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                print(f"Виртуальное окружение работает: {result.stdout.strip()}")
            else:
                print(f"Проблема с виртуальным окружением: {result.stderr}")
                python_executable = sys.executable
                print(f"Переключаемся на системный Python: {python_executable}")
        except Exception as e:
            print(f"Ошибка проверки виртуального окружения: {e}")
            python_executable = sys.executable
            print(f"Переключаемся на системный Python: {python_executable}")
    else:
        print(f"Виртуальное окружение не найдено, используется системный Python: {python_executable}")
    
    print("Запуск сервиса камер...")
    print(f"Путь к сервису: {service_path}")
    
    try:
        # Запускаем Python сервис
        process = subprocess.Popen([python_executable, service_path], 
                                 stdout=subprocess.PIPE, 
                                 stderr=subprocess.PIPE,
                                 text=True)
        
        print(f"Сервис запущен с PID: {process.pid}")
        print("Сервис доступен по адресу: http://localhost:5000")
        print("Для остановки нажмите Ctrl+C")
        
        # Ждем завершения процесса
        try:
            stdout, stderr = process.communicate()
            print("Сервис завершен")
            if stdout:
                print("STDOUT:", stdout)
            if stderr:
                print("STDERR:", stderr)
        except KeyboardInterrupt:
            print("\nПолучен сигнал остановки, завершаем процесс...")
            process.terminate()
            process.wait()
            print("Процесс завершен")
            
    except Exception as e:
        print(f"Ошибка запуска сервиса: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main() 