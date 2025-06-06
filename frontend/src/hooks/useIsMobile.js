import { useState, useEffect } from 'react';

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Проверяем User-Agent на наличие мобильных устройств
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      
      // Регулярное выражение для определения мобильных устройств
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      
      // Проверяем наличие сенсорного экрана
      const hasTouchScreen = ('ontouchstart' in window) || 
                           (navigator.maxTouchPoints > 0) || 
                           (navigator.msMaxTouchPoints > 0);
      
      // Определяем мобильное устройство по совокупности признаков
      const isMobileDevice = mobileRegex.test(userAgent.toLowerCase()) || 
                           (hasTouchScreen && /Mobile|Android|iPhone/i.test(userAgent));
      
      setIsMobile(isMobileDevice);
    };

    // Проверяем при монтировании
    checkMobile();

    // Добавляем слушатель изменения размера окна (на случай изменения ориентации)
    window.addEventListener('resize', checkMobile);

    // Очищаем слушатель при размонтировании
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}; 