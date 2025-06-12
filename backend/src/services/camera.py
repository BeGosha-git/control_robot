
import cv2
import json
import sys
import time

def list_cameras():
    cameras = []
    for i in range(10):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
                cameras.append({
                    'id': i,
                    'name': f'Камера {i}',
                    'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                    'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                })
            cap.release()
    return cameras

def stream_camera(camera_id):
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(json.dumps({'error': 'Не удалось открыть камеру'}))
        return
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print(json.dumps({'error': 'Ошибка чтения кадра'}))
            break
            
        # Конвертируем в оттенки серого
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Отправляем кадр как JSON
        print(json.dumps({
            'type': 'frame',
            'data': gray.tolist(),
            'timestamp': int(time.time() * 1000)
        }))
        
        time.sleep(1/30)  # 30 FPS
    
    cap.release()

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'list':
        print(json.dumps({'cameras': list_cameras()}))
    elif len(sys.argv) > 1:
        stream_camera(int(sys.argv[1]))
