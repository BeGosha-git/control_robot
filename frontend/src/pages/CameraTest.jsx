import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  CircularProgress,
  useMediaQuery,
  useTheme,
  Grid,
  Card,
  CardContent,
  Alert,
  Chip,
  Skeleton,
  Fade,
  Zoom,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Button,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Videocam as CameraIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  PhotoCamera as PhotoCameraIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useRobot } from '../contexts/RobotContext';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

// Единая конфигурация стримов для всего приложения
const STREAM_CONFIGS = [
  {
    name: 'Низкое качество',
    quality: 30,
    fps: 20,
    description: '20 FPS, качество 30%'
  },
  {
    name: 'Стандартное качество', 
    quality: 65,
    fps: 30,
    description: '30 FPS, качество 65%'
  },
  {
    name: 'Высокое качество',
    quality: 85,
    fps: 60,
    description: '60 FPS, качество 85%'
  }
];

// Хук для работы с камерами - убираем API запросы
const useCamerasAPI = () => {
  const [cameras, setCameras] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connected');

  const fetchCameras = useCallback(async () => {
    // Убираем API запросы - используем статические данные
    try {
      setIsLoading(true);
      setError(null);
      
      // Статические данные камер вместо API запросов
      const staticCameras = [
        {
          id: 0,
          name: 'Камера 0',
          width: 640,
          height: 480,
          fps: 30,
          is_active: true,
          is_fallback: false,
          service_info: 'active'
        },
        {
          id: 1,
          name: 'Камера 1',
          width: 640,
          height: 480,
          fps: 30,
          is_active: true,
          is_fallback: false,
          service_info: 'active'
        }
      ];
      
      setCameras(staticCameras);
      setConnectionStatus('connected');
    } catch (err) {
      console.error('Ошибка получения списка камер:', err);
      setError('Не удалось получить список камер');
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    cameras,
    isLoading,
    error,
    connectionStatus,
    fetchCameras
  };
};

// Хук для работы с конфигурацией стримов - запрашиваем из API
const useStreamsConfigAPI = () => {
  const [streamConfigs, setStreamConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStreamConfigs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Запрашиваем конфигурацию из API с новым endpoint
      const response = await fetch('/api/cameras/streams/config');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setStreamConfigs(data.permanent_streams || STREAM_CONFIGS);
    } catch (err) {
      console.error('Ошибка получения конфигурации стримов:', err);
      setError('Не удалось получить конфигурацию стримов');
      // Используем fallback конфигурацию при ошибке
      setStreamConfigs(STREAM_CONFIGS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    streamConfigs,
    isLoading,
    error,
    fetchStreamConfigs
  };
};

// Оптимизированный компонент для отображения стрима камеры
const CameraStreamViewer = ({ camera, selectedStreamConfig, onStreamConfigChange, streamConfigs }) => {
  const [streamState, setStreamState] = useState('idle'); // idle, loading, active, error
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const imgRef = useRef(null);
  const backupImgRef = useRef(null); // Резервное изображение для плавного переключения
  const streamTimeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const reconnectIntervalRef = useRef(null); // Интервал переподключения
  const currentStreamUrlRef = useRef(null); // Текущий URL стрима

  // Генерация уникального URL для стрима без timestamp
  const generateStreamUrl = useCallback((cameraId, config) => {
    if (!config) return null;
    return `/api/cameras/${cameraId}/mjpeg?quality=${config.quality}&fps=${config.fps}`;
  }, []);

  // Функция для безопасного закрытия стримов - убираем API запросы
  const closeStreams = useCallback(async (cameraId) => {
    try {
      // Принудительно останавливаем изображения
      if (imgRef.current) {
        imgRef.current.src = '';
        imgRef.current.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // Пустое изображение
      }
      if (backupImgRef.current) {
        backupImgRef.current.src = '';
        backupImgRef.current.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }

      // Отменяем текущий запрос если он есть
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Очищаем таймауты
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Очищаем интервал переподключения
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }

      // Убираем API запросы к серверу - только локальная очистка
      console.log(`Локальная очистка стримов для камеры ${cameraId}`);

      // Сбрасываем состояние стрима
      setStreamState('idle');
      currentStreamUrlRef.current = null;
      
    } catch (error) {
      console.warn(`Ошибка при закрытии стримов камеры ${cameraId}:`, error);
    }
  }, []);

  // Функция для получения снимка - убираем API запросы
  const takeSnapshot = useCallback(async () => {
    if (snapshotLoading) return;
    
    setSnapshotLoading(true);
    try {
      // Убираем API запросы - используем текущий кадр из стрима
      const activeImg = imgRef.current || backupImgRef.current;
      if (activeImg && activeImg.src && !activeImg.src.includes('data:image/gif')) {
        // Создаем canvas для захвата текущего кадра
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = activeImg.naturalWidth || 640;
        canvas.height = activeImg.naturalHeight || 480;
        
        // Рисуем текущий кадр на canvas
        ctx.drawImage(activeImg, 0, 0);
        
        // Конвертируем в blob
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            
            // Создаем ссылку для скачивания
            const a = document.createElement('a');
            a.href = url;
            a.download = `camera_${camera.id}_snapshot_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Очищаем URL
            URL.revokeObjectURL(url);
          }
        }, 'image/jpeg', 0.95);
      } else {
        console.warn('Нет доступного кадра для снимка');
      }
    } catch (error) {
      console.error('Ошибка при получении снимка:', error);
    } finally {
      setSnapshotLoading(false);
    }
  }, [camera.id, snapshotLoading]);

  // Функция для плавного переключения стримов
  const switchStreams = useCallback(() => {
    if (imgRef.current && backupImgRef.current) {
      // Плавно переключаем на резервный стрим
      const tempSrc = imgRef.current.src;
      imgRef.current.src = backupImgRef.current.src;
      backupImgRef.current.src = tempSrc;
      
      console.log(`Плавное переключение стрима для камеры ${camera.id}`);
    }
  }, [camera.id]);

  // Функция для запуска нового стрима в фоне
  const startBackgroundStream = useCallback(async (cameraId, config) => {
    if (!config) return;

    const newStreamUrl = generateStreamUrl(cameraId, config);
    if (newStreamUrl === currentStreamUrlRef.current) {
      console.log(`Стрим для камеры ${cameraId} уже активен, пропускаем`);
      return;
    }

    console.log(`Запуск фонового стрима для камеры ${cameraId}: ${newStreamUrl}`);

    // Создаем новый AbortController для фонового стрима
    const backgroundAbortController = new AbortController();
    
    try {
      // Загружаем новый стрим в резервное изображение
      if (backupImgRef.current) {
        backupImgRef.current.src = newStreamUrl;
        
        // Устанавливаем обработчики для резервного изображения
        backupImgRef.current.onload = () => {
          console.log(`Фоновый стрим загружен для камеры ${cameraId}`);
          // Плавно переключаем на новый стрим
          switchStreams();
          currentStreamUrlRef.current = newStreamUrl;
        };
        
        backupImgRef.current.onerror = () => {
          console.error(`Ошибка загрузки фонового стрима для камеры ${cameraId}`);
          // Не меняем состояние, если основной стрим работает
        };
      }
      
    } catch (error) {
      console.error(`Ошибка запуска фонового стрима камеры ${cameraId}:`, error);
    }
  }, [generateStreamUrl, switchStreams]);

  // Функция для запуска стрима
  const startStream = useCallback(async (cameraId, config) => {
    if (!config) return;

    console.log(`Начало запуска стрима для камеры ${cameraId} с конфигурацией:`, config);

    // Закрываем предыдущие стримы
    await closeStreams(cameraId);
    
    // Дополнительная задержка для корректного закрытия
    await new Promise(resolve => setTimeout(resolve, 300));
    
    setStreamState('loading');
    
    // Создаем новый AbortController
    abortControllerRef.current = new AbortController();
    
    try {
      const streamUrl = generateStreamUrl(cameraId, config);
      console.log(`Запуск стрима для камеры ${cameraId}: ${streamUrl}`);
      
      // Устанавливаем таймаут для загрузки
      streamTimeoutRef.current = setTimeout(() => {
        console.warn(`Таймаут загрузки стрима камеры ${cameraId}`);
        setStreamState('error');
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }, 10000); // 10 секунд таймаут
      
      // Загружаем изображение
      if (imgRef.current) {
        imgRef.current.src = streamUrl;
        currentStreamUrlRef.current = streamUrl;
      }
      
    } catch (error) {
      console.error(`Ошибка запуска стрима камеры ${cameraId}:`, error);
      setStreamState('error');
    }
  }, [closeStreams, generateStreamUrl]);

  // Функция для запуска автоматического переподключения
  const startAutoReconnect = useCallback((cameraId, config) => {
    // Очищаем предыдущий интервал
    if (reconnectIntervalRef.current) {
      clearInterval(reconnectIntervalRef.current);
    }

    // Запускаем новый интервал переподключения каждые 5 секунд
    reconnectIntervalRef.current = setInterval(() => {
      console.log(`Автоматическое переподключение стрима для камеры ${cameraId}`);
      startBackgroundStream(cameraId, config);
    }, 5000);

    console.log(`Запущен интервал переподключения для камеры ${cameraId} (каждые 5 секунд)`);
  }, [startBackgroundStream]);

  // Обработчики событий изображения
  const handleImageLoad = useCallback(() => {
    console.log(`Стрим загружен: ${camera.name}`);
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    setStreamState('active');
  }, [camera.name]);

  const handleImageError = useCallback(() => {
    console.error(`Ошибка загрузки стрима: ${camera.name}`);
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    setStreamState('error');
    
    // Автоматический retry через 5 секунд
    retryTimeoutRef.current = setTimeout(() => {
      if (selectedStreamConfig) {
        startStream(camera.id, selectedStreamConfig);
      }
    }, 5000);
  }, [camera.name, camera.id, selectedStreamConfig, startStream]);

  // Эффект для запуска стрима при изменении конфигурации
  useEffect(() => {
    if (selectedStreamConfig) {
      startStream(camera.id, selectedStreamConfig);
      // Запускаем автоматическое переподключение
      startAutoReconnect(camera.id, selectedStreamConfig);
    }
    
    // Очистка при размонтировании
    return () => {
      console.log(`Очистка ресурсов для камеры ${camera.id}`);
      
      // Принудительно останавливаем изображения
      if (imgRef.current) {
        imgRef.current.src = '';
        imgRef.current.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
      if (backupImgRef.current) {
        backupImgRef.current.src = '';
        backupImgRef.current.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }

      // Отменяем все запросы
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Очищаем таймауты
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Очищаем интервал переподключения
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
      }

      // Закрываем стримы на сервере
      closeStreams(camera.id);
    };
  }, [camera.id, selectedStreamConfig, startStream, closeStreams, startAutoReconnect]);

  // Обработчик смены конфигурации
  const handleStreamConfigChange = useCallback(async (event) => {
    const configIndex = event.target.value;
    const newConfig = streamConfigs[configIndex];
    
    console.log(`Смена конфигурации стрима для камеры ${camera.id}:`, newConfig);
    
    // Закрываем текущие стримы
    await closeStreams(camera.id);
    
    // Увеличенная задержка для корректного закрытия
    setTimeout(() => {
      onStreamConfigChange(camera.id, newConfig);
    }, 500);
  }, [camera.id, streamConfigs, closeStreams, onStreamConfigChange]);

  // Функция принудительного обновления стрима
  const refreshStream = useCallback(async () => {
    if (selectedStreamConfig) {
      console.log(`Принудительное обновление стрима для камеры ${camera.id}`);
      await closeStreams(camera.id);
      setTimeout(() => {
        startStream(camera.id, selectedStreamConfig);
      }, 500);
    }
  }, [camera.id, selectedStreamConfig, closeStreams, startStream]);

  const getStatusColor = () => {
    switch (streamState) {
      case 'active': return '#4CAF50';
      case 'loading': return '#FF9800';
      case 'error': return '#F44336';
      default: return '#666';
    }
  };

  const getStatusText = () => {
    switch (streamState) {
      case 'active': return 'Активен';
      case 'loading': return 'Загрузка...';
      case 'error': return 'Ошибка';
      default: return 'Неактивен';
    }
  };

  const streamUrl = useMemo(() => {
    return selectedStreamConfig ? generateStreamUrl(camera.id, selectedStreamConfig) : null;
  }, [camera.id, selectedStreamConfig, generateStreamUrl]);

    return (
    <Zoom in={true} timeout={300}>
      <Card 
        sx={{ 
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }
        }}
      >
        <CardContent sx={{ flexGrow: 1, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 600 }}>
              {camera.name}
            </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                ID: {camera.id} | Статус: {camera.service_info}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip 
                label={getStatusText()}
                sx={{
                  backgroundColor: getStatusColor(),
                  color: 'white',
                  fontSize: '0.8rem'
                }}
              icon={
                  streamState === 'error' ? <ErrorIcon /> :
                  streamState === 'loading' ? <WarningIcon /> :
                  <CheckCircleIcon />
                }
              />
              <Tooltip title="Обновить стрим">
                <IconButton 
                  size="small" 
                  onClick={refreshStream}
                  disabled={streamState === 'loading'}
                  sx={{ color: 'primary.main' }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Комбобокс для выбора типа стрима */}
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id={`stream-select-label-${camera.id}`}>
              Тип стрима
            </InputLabel>
            <Select
              labelId={`stream-select-label-${camera.id}`}
              value={streamConfigs.findIndex(config => 
                config.quality === selectedStreamConfig?.quality && 
                config.fps === selectedStreamConfig?.fps
              )}
              label="Тип стрима"
              onChange={handleStreamConfigChange}
              disabled={streamState === 'loading'}
              sx={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                '& .MuiSelect-select': {
                  color: 'text.primary'
                }
              }}
            >
              {streamConfigs.map((config, index) => (
                <MenuItem key={index} value={index}>
                  {config.name} ({config.description})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Box sx={{ position: 'relative', width: '100%', height: 240 }}>
            {streamState === 'loading' && (
              <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                zIndex: 2
              }}>
                <CircularProgress size={24} color="primary" />
                <Typography variant="caption" sx={{ color: 'primary.main' }}>
                  Загрузка стрима...
                </Typography>
              </Box>
            )}
            
            {streamState === 'error' ? (
              <Box sx={{
                width: '100%',
                height: '100%',
                background: '#000',
                borderRadius: '4px',
                border: '1px solid rgba(255,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Box sx={{ textAlign: 'center' }}>
                  <ErrorIcon sx={{ color: 'error.main', fontSize: 32, mb: 1 }} />
                  <Typography variant="body2" sx={{ color: 'error.main' }}>
                    Ошибка загрузки стрима
                  </Typography>
                </Box>
              </Box>
            ) : streamUrl ? (
              <>
                {/* Основное изображение */}
                <img
                  ref={imgRef}
                  src={streamUrl}
                  alt={`${camera.name} - ${selectedStreamConfig?.name || 'Стрим'}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    background: '#000',
                    objectFit: 'contain',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 1
                  }}
                  draggable={false}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  key={streamUrl} // Принудительное обновление при смене URL
                />
                {/* Резервное изображение для плавного переключения */}
                <img
                  ref={backupImgRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    background: '#000',
                    objectFit: 'contain',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 0,
                    opacity: 0
                  }}
                  draggable={false}
                />
              </>
            ) : (
              <Box sx={{ 
                width: '100%', 
                height: '100%', 
                background: '#000', 
                borderRadius: '4px', 
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
                }}>
                  <Box sx={{ textAlign: 'center' }}>
                  <WarningIcon sx={{ color: 'warning.main', fontSize: 32, mb: 1 }} />
                  <Typography variant="body2" sx={{ color: 'warning.main' }}>
                    Выберите тип стрима
                    </Typography>
                  </Box>
                </Box>
            )}
          </Box>

          {/* Панель управления */}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {selectedStreamConfig && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {selectedStreamConfig.name}: {selectedStreamConfig.description}
              </Typography>
            )}
            <Tooltip title="Сделать снимок">
              <IconButton 
              size="small"
                onClick={takeSnapshot}
                disabled={snapshotLoading || streamState !== 'active'}
                sx={{ color: 'primary.main' }}
              >
                <PhotoCameraIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </CardContent>
      </Card>
    </Zoom>
    );
  };

const CameraTest = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const { robotName } = useRobot();

  // Используем хуки для работы с камерами и конфигурацией стримов
  const {
    cameras,
    isLoading: camerasLoading,
    error: camerasError,
    connectionStatus,
    fetchCameras
  } = useCamerasAPI();

  const {
    streamConfigs,
    isLoading: configsLoading,
    error: configsError,
    fetchStreamConfigs
  } = useStreamsConfigAPI();

  // Состояние выбранных конфигураций стримов для каждой камеры
  const [selectedStreamConfigs, setSelectedStreamConfigs] = useState({});
  const [initialized, setInitialized] = useState(false);

  // Обработчик изменения конфигурации стрима для камеры
  const handleStreamConfigChange = useCallback((cameraId, newConfig) => {
    console.log(`Изменение конфигурации стрима для камеры ${cameraId}:`, newConfig);
    const updatedConfigs = {
      ...selectedStreamConfigs,
      [cameraId]: newConfig
    };
    setSelectedStreamConfigs(updatedConfigs);
    
    // Сохраняем в localStorage для синхронизации при перезагрузке
    try {
      localStorage.setItem('cameraStreamConfigs', JSON.stringify(updatedConfigs));
    } catch (error) {
      console.warn('Не удалось сохранить конфигурации в localStorage:', error);
    }
  }, [selectedStreamConfigs]);

  // Загрузка сохраненных конфигураций из localStorage
  const loadSavedConfigs = useCallback(() => {
    try {
      const saved = localStorage.getItem('cameraStreamConfigs');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSelectedStreamConfigs(parsed);
        return parsed;
      }
    } catch (error) {
      console.warn('Не удалось загрузить конфигурации из localStorage:', error);
    }
    return {};
  }, []);

  // Инициализация данных при загрузке (убираем автообновление)
  useEffect(() => {
    fetchCameras();
    fetchStreamConfigs();
  }, [fetchCameras, fetchStreamConfigs]);

  // Инициализация конфигураций при загрузке данных с синхронизацией
  useEffect(() => {
    if (cameras.length > 0 && streamConfigs.length > 0 && !initialized) {
      // Сначала загружаем сохраненные конфигурации
      const savedConfigs = loadSavedConfigs();
      
      const defaultConfigs = {};
      cameras.forEach(camera => {
        if (camera.is_active && !camera.is_fallback) {
          // Если есть сохраненная конфигурация, используем её
          if (savedConfigs[camera.id]) {
            // Проверяем, что сохраненная конфигурация все еще существует в загруженных данных
            const configExists = streamConfigs.some(config => 
              config.quality === savedConfigs[camera.id].quality && 
              config.fps === savedConfigs[camera.id].fps
            );
            if (configExists) {
              defaultConfigs[camera.id] = savedConfigs[camera.id];
            } else {
              // Если конфигурация не найдена, используем первую доступную из API
              defaultConfigs[camera.id] = streamConfigs[0];
            }
          } else {
            // По умолчанию выбираем первый доступный стрим из API
            defaultConfigs[camera.id] = streamConfigs[0];
          }
        }
      });
      
      if (Object.keys(defaultConfigs).length > 0) {
        setSelectedStreamConfigs(defaultConfigs);
        setInitialized(true);
        
        // Сохраняем обновленные конфигурации
        try {
          localStorage.setItem('cameraStreamConfigs', JSON.stringify(defaultConfigs));
        } catch (error) {
          console.warn('Не удалось сохранить конфигурации в localStorage:', error);
        }
      }
    }
  }, [cameras, streamConfigs, initialized, loadSavedConfigs]);

  // Редирект на главную для мобильных устройств
  useEffect(() => {
    if (isMobile) {
      navigate('/');
    }
  }, [isMobile, navigate]);

  // Фильтруем только активные камеры (не fallback)
  const activeCameras = cameras.filter(camera => camera.is_active && !camera.is_fallback);

  // Очистка всех стримов при размонтировании основного компонента
  useEffect(() => {
    return () => {
      console.log('Очистка всех стримов при размонтировании основного компонента');
      // Убираем API запросы - только локальная очистка
      activeCameras.forEach(camera => {
        console.log(`Локальная очистка стримов для камеры ${camera.id}`);
      });
    };
  }, [activeCameras]);

  // Если мобильное устройство, не рендерим компонент
  if (isMobile) {
    return null;
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#4CAF50';
      case 'disconnected': return '#F44336';
      case 'error': return '#FF9800';
      default: return '#666';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Подключено';
      case 'disconnected': return 'Отключено';
      case 'error': return 'Ошибка';
      default: return 'Проверка...';
    }
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Typography 
        variant="h6" 
        sx={{ 
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1200,
          color: 'primary.main',
          fontWeight: 'bold',
          opacity: 0.8,
          pointerEvents: 'none',
          textShadow: '0 0 10px rgba(0,0,0,0.5)'
        }}
      >
        {robotName}
      </Typography>

      <Box sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(45deg, ${theme.palette.background.default}, ${theme.palette.background.paper})`,
        p: 3
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" sx={{ color: 'primary.main' }}>
            Стримы камер
        </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Chip 
              label={`Камеры: ${activeCameras.length}`}
              color="primary"
              variant="outlined"
            />
            <Chip 
              label={getConnectionStatusText()}
              sx={{
                backgroundColor: getConnectionStatusColor(),
                color: 'white'
              }}
            />
          </Box>
        </Box>

        {(camerasError || configsError) && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => {}}>
            {camerasError || configsError}
          </Alert>
        )}

        {(camerasLoading || configsLoading) ? (
          <Grid container spacing={3}>
            {[1, 2, 3, 4].map((item) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={item}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Skeleton variant="text" width="60%" height={32} sx={{ mb: 2 }} />
                    <Skeleton variant="text" width="100%" height={40} sx={{ mb: 2 }} />
                    <Skeleton variant="rectangular" height={240} sx={{ mb: 2 }} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : activeCameras.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              Активные камеры не найдены
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Убедитесь, что камеры подключены и запущены
            </Typography>
          </Paper>
        ) : streamConfigs.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              Конфигурации стримов не загружены
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Проверьте подключение к серверу камер
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={3}>
            {activeCameras.map((camera) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={camera.id}>
                <CameraStreamViewer 
                  camera={camera} 
                  selectedStreamConfig={selectedStreamConfigs[camera.id]}
                  onStreamConfigChange={handleStreamConfigChange}
                  streamConfigs={streamConfigs}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(CameraTest); 