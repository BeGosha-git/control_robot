import axios from 'axios';
import { API_CONFIG, getApiUrl } from '../config';

// Создаем экземпляр axios с базовой конфигурацией
const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: API_CONFIG.HEADERS,
});

// Добавляем обработчик ошибок
apiClient.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

const api = {
  // Конфигурация
  getConfig: () => apiClient.get('/config'),
  saveConfig: (config) => apiClient.post('/config', config),
  
  // Статус
  getStatus: () => apiClient.get('/status'),
  
  // Выполнение команд
  executeCommand: (command) => apiClient.post('/execute', { command }),
  interruptCommand: () => apiClient.post('/interrupt'),
  
  // Файловая система
  getFileTree: (path) => apiClient.get(`/fs/list?path=${encodeURIComponent(path || '')}`),
  getFileContent: (path) => apiClient.get(`/fs/content?path=${encodeURIComponent(path)}`),
  saveFileContent: (path, content) => apiClient.post('/fs/content', { path, content }),
  uploadFiles: (formData) => apiClient.post('/fs/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  downloadFile: (path) => getApiUrl(`/fs/raw?path=${encodeURIComponent(path)}`),
  downloadZip: (paths) => apiClient.post('/fs/zip', { paths }, { responseType: 'blob' }),
  
  // Перемещение файлов
  moveFile: (source, destination) => apiClient.post('/fs/move', { source, destination }),
  moveFiles: (sources) => apiClient.post('/fs/move', { sources }),
  copyFile: (source, destination) => apiClient.post('/fs/copy', { source, destination }),
  renameFile: (oldPath, newPath) => apiClient.post('/fs/rename', { oldPath, newPath }),
  deleteFile: (path) => apiClient.delete('/fs/delete', { data: { path } }),
  
  // Движения
  saveMotion: (filename, code) => apiClient.post('/motions', { filename, code }),
  getMotion: (filename) => apiClient.get(`/motions/${filename}`),
  deleteMotion: (filename) => apiClient.delete(`/motions/${filename}`),
  
  // Вспомогательные функции
  getRootPath: async () => {
    try {
      const res = await apiClient.get('/config');
      return res.data.rootPath || '';
    } catch {
      return '';
    }
  },
  
  getRobotButtons: async () => {
    try {
      const res = await apiClient.get('/config');
      return (res.data.robotButtons || []).filter(b => b.showInEditor !== false);
    } catch {
      return [];
    }
  }
};

export default api; 