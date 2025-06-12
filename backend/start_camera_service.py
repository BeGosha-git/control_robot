#!/usr/bin/env python3
"""
Скрипт для запуска сервиса камер
"""

import sys
import os
import subprocess
import time

def main():
    # Путь к сервису камер
    service_path = os.path.join(os.path.dirname(__file__), 'src', 'services', 'camera_service.py')
    
    print("Запуск сервиса камер...")
    print(f"Путь к сервису: {service_path}")
    
    try:
        # Запускаем Python сервис
        process = subprocess.Popen([sys.executable, service_path], 
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