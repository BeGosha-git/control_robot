import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { useRobot } from '../contexts/RobotContext';

export const useFileSystem = () => {
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const pollingRef = useRef(null);
  const lastPathRef = useRef('');
  const isFetchingRef = useRef(false);
  const isUnmountedRef = useRef(false);

  // Получаем rootPath из RobotContext
  const { robotConfig } = useRobot();
  const rootPath = robotConfig?.rootPath || '';

  // Очистка таймера опроса
  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Получение списка файлов с задержкой 2 секунды между завершением одного и началом следующего
  const pollFileTree = useCallback(async () => {
    if (isUnmountedRef.current) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const response = await api.getFileTree(lastPathRef.current);
      setFiles(response.data);
      setError(null);
    } catch (error) {
      console.error('Ошибка при получении списка файлов:', error);
      if (error.response?.status === 404) {
        setFiles({ items: [], stats: { totalItems: 0, directories: 0, files: 0 } });
        setError('Директория не существует');
      } else {
        setError(error.response?.data?.error || 'Ошибка при загрузке списка файлов');
      }
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
      if (!isUnmountedRef.current) {
        pollingRef.current = setTimeout(pollFileTree, 2000);
      }
    }
  }, []);

  // Запуск опроса при изменении currentPath
  useEffect(() => {
    lastPathRef.current = currentPath;
    clearPolling();
    pollFileTree();
    return () => {
      clearPolling();
    };
  }, [currentPath, pollFileTree, clearPolling]);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      clearPolling();
    };
  }, [clearPolling]);

  // Смена директории только по явному действию пользователя
  const handleDirectorySelect = useCallback((path) => {
    setCurrentPath(path);
    setError(null);
  }, []);

  // Обработка выбора файла
  const handleFileSelect = useCallback((path) => {
    if (!path) return;
    // Здесь мы не делаем ничего, так как обработка открытия файла
    // происходит в хуке useTabs через handleFileSelect
    return path;
  }, []);

  return {
    files,
    currentPath,
    rootPath,
    error,
    isLoading,
    handleDirectorySelect,
    handleFileSelect,
    fetchFileTree: pollFileTree // экспортируем для ручного вызова, если нужно
  };
}; 