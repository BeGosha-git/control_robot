#!/usr/bin/env python3
"""
Расширенный тест сервиса камер с 30-секундным тестированием
"""

import requests
import json
import time
import threading
from datetime import datetime
import statistics

class ExtendedCameraTest:
    def __init__(self, base_url="http://localhost:5000"):
        self.base_url = base_url
        self.test_results = {
            'start_time': None,
            'end_time': None,
            'duration': 0,
            'tests_passed': 0,
            'tests_failed': 0,
            'total_frames_received': 0,
            'frame_rates': {},
            'errors': [],
            'performance_metrics': {}
        }
        
    def log(self, message, level="INFO"):
        """Логирование с временными метками"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[{timestamp}] {level}: {message}")
        
    def test_server_connection(self):
        """Тест подключения к серверу"""
        self.log("🔌 Тестирование подключения к серверу...")
        try:
            response = requests.get(f"{self.base_url}/api/status", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.log(f"✅ Сервер доступен: {data}")
                return True
            else:
                self.log(f"❌ Ошибка сервера: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Не удалось подключиться к серверу: {e}", "ERROR")
            return False
    
    def test_camera_discovery(self):
        """Тест обнаружения камер"""
        self.log("🔍 Тестирование обнаружения камер...")
        try:
            response = requests.get(f"{self.base_url}/api/cameras", timeout=10)
            if response.status_code == 200:
                data = response.json()
                cameras = data.get('cameras', [])
                self.log(f"✅ Найдено камер: {len(cameras)}")
                
                for camera in cameras:
                    self.log(f"   📹 {camera['name']} (ID: {camera['id']}, "
                           f"{camera['width']}x{camera['height']} @ {camera['fps']}fps)")
                
                return len(cameras)
            else:
                self.log(f"❌ Ошибка получения списка камер: {response.status_code}")
                return 0
        except Exception as e:
            self.log(f"❌ Ошибка обнаружения камер: {e}", "ERROR")
            return 0
    
    def test_camera_start_stop(self):
        """Тест запуска и остановки камер"""
        self.log("🎬 Тестирование запуска и остановки камер...")
        try:
            # Запуск всех камер
            response = requests.post(f"{self.base_url}/api/cameras/start-all", timeout=10)
            if response.status_code == 200:
                data = response.json()
                started_count = data.get('started_count', 0)
                self.log(f"✅ Запущено камер: {started_count}")
                
                # Проверяем статус
                time.sleep(2)
                status_response = requests.get(f"{self.base_url}/api/status")
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    self.log(f"📊 Статус: {status_data['active_cameras']} активных камер")
                
                # Останавливаем камеры
                time.sleep(1)
                stop_response = requests.post(f"{self.base_url}/api/cameras/stop-all", timeout=10)
                if stop_response.status_code == 200:
                    self.log("✅ Все камеры остановлены")
                    return True
                else:
                    self.log(f"❌ Ошибка остановки камер: {stop_response.status_code}")
                    return False
            else:
                self.log(f"❌ Ошибка запуска камер: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Ошибка тестирования запуска/остановки: {e}", "ERROR")
            return False
    
    def test_frame_capture(self, duration=30):
        """Расширенный тест захвата кадров в течение указанного времени"""
        self.log(f"📸 Тестирование захвата кадров в течение {duration} секунд...")
        
        # Запускаем камеры
        try:
            response = requests.post(f"{self.base_url}/api/cameras/start-all", timeout=10)
            if response.status_code != 200:
                self.log("❌ Не удалось запустить камеры для тестирования")
                return False
        except Exception as e:
            self.log(f"❌ Ошибка запуска камер: {e}", "ERROR")
            return False
        
        # Собираем метрики
        frame_counts = {}
        frame_times = {}
        start_time = time.time()
        last_frame_times = {}
        
        self.log("🎥 Начинаем сбор кадров...")
        
        while time.time() - start_time < duration:
            try:
                # Получаем кадры со всех камер
                response = requests.get(f"{self.base_url}/api/cameras/frames", timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    frames = data.get('frames', [])
                    current_time = time.time()
                    
                    self.test_results['total_frames_received'] += len(frames)
                    
                    for frame_data in frames:
                        camera_id = frame_data['camera_id']
                        
                        if camera_id not in frame_counts:
                            frame_counts[camera_id] = 0
                            frame_times[camera_id] = []
                            last_frame_times[camera_id] = current_time
                        
                        frame_counts[camera_id] += 1
                        frame_times[camera_id].append(current_time)
                        
                        # Вычисляем FPS
                        if len(frame_times[camera_id]) > 1:
                            time_diff = current_time - last_frame_times[camera_id]
                            if time_diff > 0:
                                fps = 1.0 / time_diff
                                if camera_id not in self.test_results['frame_rates']:
                                    self.test_results['frame_rates'][camera_id] = []
                                self.test_results['frame_rates'][camera_id].append(fps)
                        
                        last_frame_times[camera_id] = current_time
                
                # Показываем прогресс каждые 5 секунд
                elapsed = time.time() - start_time
                if int(elapsed) % 5 == 0 and elapsed > 0:
                    self.log(f"⏱️ Прогресс: {elapsed:.1f}/{duration} сек, "
                           f"кадров получено: {self.test_results['total_frames_received']}")
                
                time.sleep(0.1)  # Небольшая задержка
                
            except Exception as e:
                self.log(f"❌ Ошибка получения кадров: {e}", "ERROR")
                self.test_results['errors'].append({
                    'time': time.time(),
                    'error': str(e)
                })
                time.sleep(1)
        
        # Останавливаем камеры
        try:
            requests.post(f"{self.base_url}/api/cameras/stop-all", timeout=10)
            self.log("✅ Камеры остановлены после тестирования")
        except Exception as e:
            self.log(f"⚠️ Ошибка остановки камер: {e}", "WARNING")
        
        # Анализируем результаты
        self.log("📊 Анализ результатов захвата кадров...")
        for camera_id in frame_counts:
            total_frames = frame_counts[camera_id]
            avg_fps = total_frames / duration if duration > 0 else 0
            
            if camera_id in self.test_results['frame_rates']:
                fps_values = self.test_results['frame_rates'][camera_id]
                if fps_values:
                    avg_fps_calculated = statistics.mean(fps_values)
                    max_fps = max(fps_values)
                    min_fps = min(fps_values)
                else:
                    avg_fps_calculated = avg_fps
                    max_fps = min_fps = avg_fps
            else:
                avg_fps_calculated = avg_fps
                max_fps = min_fps = avg_fps
            
            self.log(f"   📹 Камера {camera_id}: {total_frames} кадров, "
                   f"средний FPS: {avg_fps_calculated:.2f} "
                   f"(мин: {min_fps:.2f}, макс: {max_fps:.2f})")
            
            # Сохраняем метрики производительности
            self.test_results['performance_metrics'][f'camera_{camera_id}'] = {
                'total_frames': total_frames,
                'avg_fps': avg_fps_calculated,
                'max_fps': max_fps,
                'min_fps': min_fps,
                'duration': duration
            }
        
        return True
    
    def test_individual_camera_control(self):
        """Тест индивидуального управления камерами"""
        self.log("🎛️ Тестирование индивидуального управления камерами...")
        
        try:
            # Получаем список камер
            response = requests.get(f"{self.base_url}/api/cameras", timeout=10)
            if response.status_code != 200:
                self.log("❌ Не удалось получить список камер")
                return False
            
            cameras = response.json().get('cameras', [])
            if not cameras:
                self.log("⚠️ Нет доступных камер для тестирования")
                return True
            
            # Тестируем каждую камеру отдельно
            for camera in cameras[:3]:  # Тестируем только первые 3 камеры
                camera_id = camera['id']
                self.log(f"🔧 Тестирование камеры {camera_id}...")
                
                # Запуск камеры
                start_response = requests.post(f"{self.base_url}/api/camera/{camera_id}/start", timeout=10)
                if start_response.status_code == 200:
                    self.log(f"   ✅ Камера {camera_id} запущена")
                    
                    # Получаем кадр
                    time.sleep(1)
                    frame_response = requests.get(f"{self.base_url}/api/camera/{camera_id}/frame", timeout=5)
                    if frame_response.status_code == 200:
                        frame_data = frame_response.json()
                        self.log(f"   📸 Получен кадр с камеры {camera_id}")
                    else:
                        self.log(f"   ⚠️ Не удалось получить кадр с камеры {camera_id}")
                    
                    # Останавливаем камеру
                    stop_response = requests.post(f"{self.base_url}/api/camera/{camera_id}/stop", timeout=10)
                    if stop_response.status_code == 200:
                        self.log(f"   ✅ Камера {camera_id} остановлена")
                    else:
                        self.log(f"   ⚠️ Ошибка остановки камеры {camera_id}")
                else:
                    self.log(f"   ❌ Не удалось запустить камеру {camera_id}")
            
            return True
            
        except Exception as e:
            self.log(f"❌ Ошибка тестирования индивидуального управления: {e}", "ERROR")
            return False
    
    def test_error_handling(self):
        """Тест обработки ошибок"""
        self.log("🚨 Тестирование обработки ошибок...")
        
        # Тест несуществующей камеры
        try:
            response = requests.get(f"{self.base_url}/api/camera/999/frame", timeout=5)
            if response.status_code == 404:
                self.log("✅ Корректная обработка несуществующей камеры")
            else:
                self.log(f"⚠️ Неожиданный ответ для несуществующей камеры: {response.status_code}")
        except Exception as e:
            self.log(f"❌ Ошибка тестирования несуществующей камеры: {e}", "ERROR")
        
        # Тест остановки неактивной камеры
        try:
            response = requests.post(f"{self.base_url}/api/camera/999/stop", timeout=5)
            if response.status_code == 404:
                self.log("✅ Корректная обработка остановки неактивной камеры")
            else:
                self.log(f"⚠️ Неожиданный ответ для остановки неактивной камеры: {response.status_code}")
        except Exception as e:
            self.log(f"❌ Ошибка тестирования остановки неактивной камеры: {e}", "ERROR")
        
        return True
    
    def run_comprehensive_test(self, duration=30):
        """Запуск комплексного тестирования"""
        self.log("🚀 Начинаем комплексное тестирование сервиса камер...")
        self.test_results['start_time'] = time.time()
        
        # Тест 1: Подключение к серверу
        if not self.test_server_connection():
            self.log("❌ Тест не может быть продолжен - сервер недоступен", "ERROR")
            return False
        
        # Тест 2: Обнаружение камер
        camera_count = self.test_camera_discovery()
        if camera_count == 0:
            self.log("⚠️ Камеры не обнаружены, но продолжаем тестирование", "WARNING")
        
        # Тест 3: Запуск и остановка камер
        if self.test_camera_start_stop():
            self.test_results['tests_passed'] += 1
        else:
            self.test_results['tests_failed'] += 1
        
        # Тест 4: Индивидуальное управление камерами
        if self.test_individual_camera_control():
            self.test_results['tests_passed'] += 1
        else:
            self.test_results['tests_failed'] += 1
        
        # Тест 5: Расширенный захват кадров
        if self.test_frame_capture(duration):
            self.test_results['tests_passed'] += 1
        else:
            self.test_results['tests_failed'] += 1
        
        # Тест 6: Обработка ошибок
        if self.test_error_handling():
            self.test_results['tests_passed'] += 1
        else:
            self.test_results['tests_failed'] += 1
        
        # Завершение тестирования
        self.test_results['end_time'] = time.time()
        self.test_results['duration'] = self.test_results['end_time'] - self.test_results['start_time']
        
        self.print_final_report()
        return True
    
    def print_final_report(self):
        """Вывод финального отчета"""
        self.log("📋 ФИНАЛЬНЫЙ ОТЧЕТ ТЕСТИРОВАНИЯ")
        self.log("=" * 50)
        self.log(f"⏱️ Общая продолжительность: {self.test_results['duration']:.2f} секунд")
        self.log(f"✅ Тестов пройдено: {self.test_results['tests_passed']}")
        self.log(f"❌ Тестов провалено: {self.test_results['tests_failed']}")
        self.log(f"📸 Всего кадров получено: {self.test_results['total_frames_received']}")
        
        if self.test_results['performance_metrics']:
            self.log("\n📊 МЕТРИКИ ПРОИЗВОДИТЕЛЬНОСТИ:")
            for camera_id, metrics in self.test_results['performance_metrics'].items():
                self.log(f"   {camera_id}:")
                self.log(f"     - Кадров: {metrics['total_frames']}")
                self.log(f"     - Средний FPS: {metrics['avg_fps']:.2f}")
                self.log(f"     - Максимальный FPS: {metrics['max_fps']:.2f}")
                self.log(f"     - Минимальный FPS: {metrics['min_fps']:.2f}")
        
        if self.test_results['errors']:
            self.log(f"\n🚨 ОШИБКИ ({len(self.test_results['errors'])}):")
            for error in self.test_results['errors'][:5]:  # Показываем только первые 5 ошибок
                self.log(f"   - {error['error']}")
        
        success_rate = (self.test_results['tests_passed'] / 
                       (self.test_results['tests_passed'] + self.test_results['tests_failed'])) * 100
        self.log(f"\n🎯 УСПЕШНОСТЬ: {success_rate:.1f}%")
        
        if success_rate >= 80:
            self.log("🎉 ТЕСТИРОВАНИЕ ПРОЙДЕНО УСПЕШНО!")
        else:
            self.log("⚠️ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО С ПРЕДУПРЕЖДЕНИЯМИ")

def main():
    """Главная функция"""
    print("🎥 РАСШИРЕННОЕ ТЕСТИРОВАНИЕ СЕРВИСА КАМЕР")
    print("=" * 60)
    
    # Создаем экземпляр тестера
    tester = ExtendedCameraTest()
    
    # Запускаем комплексное тестирование на 30 секунд
    success = tester.run_comprehensive_test(duration=30)
    
    if success:
        print("\n✅ Тестирование завершено успешно!")
    else:
        print("\n❌ Тестирование завершено с ошибками!")

if __name__ == '__main__':
    main()
