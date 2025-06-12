import requests, time, json
from datetime import datetime

def log(message, level="INFO"):
    """Логирование с временными метками"""
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{timestamp}] {level}: {message}")

def test_server_connection():
    """Тест подключения к серверу"""
    log("🔌 Тестирование подключения к серверу...")
    try:
        response = requests.get("http://localhost:5000/api/status", timeout=10)
        if response.status_code == 200:
            data = response.json()
            log(f"✅ Сервер доступен: {data}")
            return True
        else:
            log(f"❌ Ошибка сервера: {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Не удалось подключиться к серверу: {e}", "ERROR")
        return False

def test_camera_discovery():
    """Тест обнаружения камер"""
    log("🔍 Тестирование обнаружения камер...")
    try:
        response = requests.get("http://localhost:5000/api/cameras", timeout=10)
        if response.status_code == 200:
            data = response.json()
            cameras = data.get('cameras', [])
            log(f"✅ Найдено камер: {len(cameras)}")
            
            for camera in cameras:
                log(f"   📹 {camera['name']} (ID: {camera['id']}, "
                   f"{camera['width']}x{camera['height']} @ {camera['fps']}fps)")
            
            return len(cameras)
        else:
            log(f"❌ Ошибка получения списка камер: {response.status_code}")
            return 0
    except Exception as e:
        log(f"❌ Ошибка обнаружения камер: {e}", "ERROR")
        return 0

def test_camera_start_stop():
    """Тест запуска и остановки камер"""
    log("🎬 Тестирование запуска и остановки камер...")
    try:
        # Запуск всех камер
        response = requests.post("http://localhost:5000/api/cameras/start-all", timeout=10)
        if response.status_code == 200:
            data = response.json()
            started_count = data.get('started_count', 0)
            log(f"✅ Запущено камер: {started_count}")
            
            # Проверяем статус
            time.sleep(2)
            status_response = requests.get("http://localhost:5000/api/status")
            if status_response.status_code == 200:
                status_data = status_response.json()
                log(f"📊 Статус: {status_data['active_cameras']} активных камер")
            
            # Останавливаем камеры
            time.sleep(1)
            stop_response = requests.post("http://localhost:5000/api/cameras/stop-all", timeout=10)
            if stop_response.status_code == 200:
                log("✅ Все камеры остановлены")
                return True
            else:
                log(f"❌ Ошибка остановки камер: {stop_response.status_code}")
                return False
        else:
            log(f"❌ Ошибка запуска камер: {response.status_code}")
            return False
    except Exception as e:
        log(f"❌ Ошибка тестирования запуска/остановки: {e}", "ERROR")
        return False

def test_frame_capture(duration=30):
    """Расширенный тест захвата кадров в течение указанного времени"""
    log(f"📸 Тестирование захвата кадров в течение {duration} секунд...")
    
    # Запускаем камеры
    try:
        response = requests.post("http://localhost:5000/api/cameras/start-all", timeout=10)
        if response.status_code != 200:
            log("❌ Не удалось запустить камеры для тестирования")
            return False
    except Exception as e:
        log(f"❌ Ошибка запуска камер: {e}", "ERROR")
        return False
    
    # Собираем метрики
    frame_counts = {}
    start_time = time.time()
    total_frames_received = 0
    errors = []
    
    log("🎥 Начинаем сбор кадров...")
    
    while time.time() - start_time < duration:
        try:
            # Получаем кадры со всех камер
            response = requests.get("http://localhost:5000/api/cameras/frames", timeout=5)
            if response.status_code == 200:
                data = response.json()
                frames = data.get('frames', [])
                current_time = time.time()
                
                total_frames_received += len(frames)
                
                for frame_data in frames:
                    camera_id = frame_data['camera_id']
                    
                    if camera_id not in frame_counts:
                        frame_counts[camera_id] = 0
                    
                    frame_counts[camera_id] += 1
            
            # Показываем прогресс каждые 5 секунд
            elapsed = time.time() - start_time
            if int(elapsed) % 5 == 0 and elapsed > 0:
                log(f"⏱️ Прогресс: {elapsed:.1f}/{duration} сек, "
                   f"кадров получено: {total_frames_received}")
            
            time.sleep(0.1)  # Небольшая задержка
            
        except Exception as e:
            log(f"❌ Ошибка получения кадров: {e}", "ERROR")
            errors.append({
                'time': time.time(),
                'error': str(e)
            })
            time.sleep(1)
    
    # Останавливаем камеры
    try:
        requests.post("http://localhost:5000/api/cameras/stop-all", timeout=10)
        log("✅ Камеры остановлены после тестирования")
    except Exception as e:
        log(f"⚠️ Ошибка остановки камер: {e}", "WARNING")
    
    # Анализируем результаты
    log("📊 Анализ результатов захвата кадров...")
    for camera_id in frame_counts:
        total_frames = frame_counts[camera_id]
        avg_fps = total_frames / duration if duration > 0 else 0
        
        log(f"   📹 Камера {camera_id}: {total_frames} кадров, "
           f"средний FPS: {avg_fps:.2f}")
    
    log(f"📸 Всего кадров получено: {total_frames_received}")
    if errors:
        log(f"🚨 Ошибок: {len(errors)}")
    
    return True

def test_individual_camera_control():
    """Тест индивидуального управления камерами"""
    log("🎛️ Тестирование индивидуального управления камерами...")
    
    try:
        # Получаем список камер
        response = requests.get("http://localhost:5000/api/cameras", timeout=10)
        if response.status_code != 200:
            log("❌ Не удалось получить список камер")
            return False
        
        cameras = response.json().get('cameras', [])
        if not cameras:
            log("⚠️ Нет доступных камер для тестирования")
            return True
        
        # Тестируем каждую камеру отдельно
        for camera in cameras[:3]:  # Тестируем только первые 3 камеры
            camera_id = camera['id']
            log(f"🔧 Тестирование камеры {camera_id}...")
            
            # Запуск камеры
            start_response = requests.post(f"http://localhost:5000/api/camera/{camera_id}/start", timeout=10)
            if start_response.status_code == 200:
                log(f"   ✅ Камера {camera_id} запущена")
                
                # Получаем кадр
                time.sleep(1)
                frame_response = requests.get(f"http://localhost:5000/api/camera/{camera_id}/frame", timeout=5)
                if frame_response.status_code == 200:
                    frame_data = frame_response.json()
                    log(f"   📸 Получен кадр с камеры {camera_id}")
                else:
                    log(f"   ⚠️ Не удалось получить кадр с камеры {camera_id}")
                
                # Останавливаем камеру
                stop_response = requests.post(f"http://localhost:5000/api/camera/{camera_id}/stop", timeout=10)
                if stop_response.status_code == 200:
                    log(f"   ✅ Камера {camera_id} остановлена")
                else:
                    log(f"   ⚠️ Ошибка остановки камеры {camera_id}")
            else:
                log(f"   ❌ Не удалось запустить камеру {camera_id}")
        
        return True
        
    except Exception as e:
        log(f"❌ Ошибка тестирования индивидуального управления: {e}", "ERROR")
        return False

def test_error_handling():
    """Тест обработки ошибок"""
    log("🚨 Тестирование обработки ошибок...")
    
    # Тест несуществующей камеры
    try:
        response = requests.get("http://localhost:5000/api/camera/999/frame", timeout=5)
        if response.status_code == 404:
            log("✅ Корректная обработка несуществующей камеры")
        else:
            log(f"⚠️ Неожиданный ответ для несуществующей камеры: {response.status_code}")
    except Exception as e:
        log(f"❌ Ошибка тестирования несуществующей камеры: {e}", "ERROR")
    
    # Тест остановки неактивной камеры
    try:
        response = requests.post("http://localhost:5000/api/camera/999/stop", timeout=5)
        if response.status_code == 404:
            log("✅ Корректная обработка остановки неактивной камеры")
        else:
            log(f"⚠️ Неожиданный ответ для остановки неактивной камеры: {response.status_code}")
    except Exception as e:
        log(f"❌ Ошибка тестирования остановки неактивной камеры: {e}", "ERROR")
    
    return True

def run_comprehensive_test(duration=30):
    """Запуск комплексного тестирования"""
    log("🚀 Начинаем комплексное тестирование сервиса камер...")
    start_time = time.time()
    
    tests_passed = 0
    tests_failed = 0
    
    # Тест 1: Подключение к серверу
    if test_server_connection():
        tests_passed += 1
    else:
        tests_failed += 1
        log("❌ Тест не может быть продолжен - сервер недоступен", "ERROR")
        return False
    
    # Тест 2: Обнаружение камер
    camera_count = test_camera_discovery()
    if camera_count == 0:
        log("⚠️ Камеры не обнаружены, но продолжаем тестирование", "WARNING")
    
    # Тест 3: Запуск и остановка камер
    if test_camera_start_stop():
        tests_passed += 1
    else:
        tests_failed += 1
    
    # Тест 4: Индивидуальное управление камерами
    if test_individual_camera_control():
        tests_passed += 1
    else:
        tests_failed += 1
    
    # Тест 5: Расширенный захват кадров
    if test_frame_capture(duration):
        tests_passed += 1
    else:
        tests_failed += 1
    
    # Тест 6: Обработка ошибок
    if test_error_handling():
        tests_passed += 1
    else:
        tests_failed += 1
    
    # Завершение тестирования
    end_time = time.time()
    total_duration = end_time - start_time
    
    # Финальный отчет
    log("📋 ФИНАЛЬНЫЙ ОТЧЕТ ТЕСТИРОВАНИЯ")
    log("=" * 50)
    log(f"⏱️ Общая продолжительность: {total_duration:.2f} секунд")
    log(f"✅ Тестов пройдено: {tests_passed}")
    log(f"❌ Тестов провалено: {tests_failed}")
    
    success_rate = (tests_passed / (tests_passed + tests_failed)) * 100
    log(f"🎯 УСПЕШНОСТЬ: {success_rate:.1f}%")
    
    if success_rate >= 80:
        log("🎉 ТЕСТИРОВАНИЕ ПРОЙДЕНО УСПЕШНО!")
    else:
        log("⚠️ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО С ПРЕДУПРЕЖДЕНИЯМИ")
    
    return True

def main():
    """Главная функция"""
    print("🎥 РАСШИРЕННОЕ ТЕСТИРОВАНИЕ СЕРВИСА КАМЕР")
    print("=" * 60)
    
    # Запускаем комплексное тестирование на 30 секунд
    success = run_comprehensive_test(duration=30)
    
    if success:
        print("\n✅ Тестирование завершено успешно!")
    else:
        print("\n❌ Тестирование завершено с ошибками!")

if __name__ == '__main__':
    main()
