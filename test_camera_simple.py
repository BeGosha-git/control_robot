#!/usr/bin/env python3
"""
Простой тест Python сервиса камер
"""

import cv2
import time

def test_cameras():
    print("🔍 Тестирование обнаружения камер...")
    
    cameras = []
    for i in range(5):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
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
                cameras.append(camera_info)
                print(f"✅ Найдена камера {i}: {width}x{height} @ {fps}fps")
            else:
                print(f"⚠️ Камера {i} открыта, но не может читать кадры")
            cap.release()
        else:
            print(f"❌ Камера {i} недоступна")
    
    print(f"\n📊 Итого найдено камер: {len(cameras)}")
    
    if cameras:
        print("\n🎥 Тестирование захвата кадров...")
        for camera in cameras:
            cap = cv2.VideoCapture(camera['id'])
            if cap.isOpened():
                # Настраиваем параметры
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_FPS, 30)
                
                # Пробуем захватить несколько кадров
                success_count = 0
                for _ in range(10):
                    ret, frame = cap.read()
                    if ret:
                        success_count += 1
                    time.sleep(0.1)
                
                print(f"✅ Камера {camera['id']}: {success_count}/10 кадров успешно")
                cap.release()
            else:
                print(f"❌ Не удалось открыть камеру {camera['id']}")
    
    return len(cameras) > 0

if __name__ == '__main__':
    test_cameras() 