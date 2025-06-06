// Определяем базовый URL API в зависимости от окружения
const getApiBaseUrl = () => {
  // В production используем относительный путь
  if (process.env.NODE_ENV === 'production') {
    return '/api';
  }
  // В development используем локальный сервер
  return 'http://localhost:3001/api';
};

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  TIMEOUT: 30000, // 30 секунд
  HEADERS: {
    'Content-Type': 'application/json',
  },
};

// Функция для получения полного URL
export const getApiUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}; 