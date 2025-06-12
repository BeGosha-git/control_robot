#!/usr/bin/env python3
"""
Тестовый скрипт для проверки работы сервиса камер
"""

import requests
import json
import time

def test_camera_service():
    base_url = "http://localhost:5000"
    
    print("Тестирование сервиса камер...")
    
    # Тест 1: Проверка статуса
    try:
        response = requests.get(f"{base_url}/api/status")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Статус сервиса: {data}")
        else:
            print(f"❌ Ошибка статуса: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка подключения к сервису: {e}")
        return False
    
    # Тест 2: Получение списка камер
    try:
        response = requests.get(f"{base_url}/api/cameras")
        if response.status_code == 200:
            data = response.json()
            cameras = data.get('cameras', [])
            print(f"✅ Найдено камер: {len(cameras)}")
            for camera in cameras:
                print(f"   - {camera['name']} (ID: {camera['id']}, Активна: {camera['is_active']})")
        else:
            print(f"❌ Ошибка получения списка камер: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка получения списка камер: {e}")
        return False
    
    # Тест 3: Запуск всех камер
    try:
        response = requests.post(f"{base_url}/api/cameras/start-all")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Запущено камер: {data.get('started_count', 0)}")
        else:
            print(f"❌ Ошибка запуска камер: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка запуска камер: {e}")
        return False
    
    # Тест 4: Получение кадров
    try:
        response = requests.get(f"{base_url}/api/cameras/frames")
        if response.status_code == 200:
            data = response.json()
            frames_count = data.get('count', 0)
            print(f"✅ Получено кадров: {frames_count}")
        else:
            print(f"❌ Ошибка получения кадров: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка получения кадров: {e}")
        return False
    
    # Тест 5: Остановка всех камер
    try:
        response = requests.post(f"{base_url}/api/cameras/stop-all")
        if response.status_code == 200:
            print("✅ Все камеры остановлены")
        else:
            print(f"❌ Ошибка остановки камер: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка остановки камер: {e}")
        return False
    
    print("\n🎉 Все тесты пройдены успешно!")
    return True

if __name__ == '__main__':
    test_camera_service() 