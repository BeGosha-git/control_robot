import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  CircularProgress,
  Button,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
  Grid,
  Card,
  CardContent,
  Alert,
  Chip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Videocam as CameraIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  PlayCircleOutline as StartAllIcon,
  StopCircle as StopAllIcon
} from '@mui/icons-material';
import { useRobot } from '../contexts/RobotContext';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

const CameraTest = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isLandscape = useMediaQuery('(orientation: landscape)');
  const [cameras, setCameras] = useState([]);
  const [activeCameras, setActiveCameras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamData, setStreamData] = useState({});
  const eventSourceRef = useRef(null);
  const { robotName } = useRobot();

  // Получение списка всех доступных камер
  const fetchCameras = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3001/api/cameras');
      const data = await response.json();
      setCameras(data.cameras || []);
      setActiveCameras(data.cameras?.filter(cam => cam.is_active) || []);
      setError(null);
    } catch (err) {
      console.error('Ошибка получения списка камер:', err);
      setError('Не удалось получить список камер');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Запуск всех камер
  const startAllCameras = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/cameras/start-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Запущено камер:', data.started_count);
        await fetchCameras(); // Обновляем список
      } else {
        setError('Не удалось запустить камеры');
      }
    } catch (err) {
      console.error('Ошибка запуска камер:', err);
      setError('Ошибка запуска камер');
    }
  }, [fetchCameras]);

  // Остановка всех камер
  const stopAllCameras = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/cameras/stop-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log('Все камеры остановлены');
        await fetchCameras(); // Обновляем список
      } else {
        setError('Не удалось остановить камеры');
      }
    } catch (err) {
      console.error('Ошибка остановки камер:', err);
      setError('Ошибка остановки камер');
    }
  }, [fetchCameras]);

  // Запуск конкретной камеры
  const startCamera = useCallback(async (cameraId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/camera/${cameraId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        await fetchCameras(); // Обновляем список
      } else {
        setError(`Не удалось запустить камеру ${cameraId}`);
      }
    } catch (err) {
      console.error('Ошибка запуска камеры:', err);
      setError('Ошибка запуска камеры');
    }
  }, [fetchCameras]);

  // Остановка конкретной камеры
  const stopCamera = useCallback(async (cameraId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/camera/${cameraId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        await fetchCameras(); // Обновляем список
      } else {
        setError(`Не удалось остановить камеру ${cameraId}`);
      }
    } catch (err) {
      console.error('Ошибка остановки камеры:', err);
      setError('Ошибка остановки камеры');
    }
  }, [fetchCameras]);

  // Подключение к стриму камер
  const connectToStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('http://localhost:3001/api/cameras/stream');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'frames') {
          setStreamData(prev => {
            const newData = { ...prev };
            data.frames.forEach(frame => {
              newData[frame.camera_id] = frame;
            });
            return newData;
          });
        }
      } catch (err) {
        console.error('Ошибка обработки данных стрима:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Ошибка EventSource:', error);
      setError('Ошибка подключения к стриму');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Компонент для отображения кадра камеры
  const CameraFrame = ({ camera, frameData }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
      if (frameData && canvasRef.current) {
    const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
        };
        
        img.src = `data:image/jpeg;base64,${frameData.frame}`;
      }
    }, [frameData]);

    return (
      <Card 
        sx={{ 
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <CardContent sx={{ flexGrow: 1, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ color: 'primary.main' }}>
              {camera.name}
            </Typography>
            <Chip 
              label={camera.is_active ? 'Активна' : 'Неактивна'} 
              color={camera.is_active ? 'success' : 'default'}
              size="small"
            />
          </Box>
          
          <Box sx={{ position: 'relative', width: '100%', height: 240 }}>
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: '100%',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                background: '#000',
                objectFit: 'contain'
              }}
            />
            {!camera.is_active && (
              <Box sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.7)',
                borderRadius: '4px'
              }}>
                <Typography variant="body2" sx={{ color: 'white' }}>
                  Камера неактивна
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={camera.is_active ? <StopIcon /> : <PlayIcon />}
              onClick={() => camera.is_active ? stopCamera(camera.id) : startCamera(camera.id)}
              fullWidth
            >
              {camera.is_active ? 'Остановить' : 'Запустить'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Эффект для загрузки камер при монтировании
  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Эффект для подключения к стриму
  useEffect(() => {
    const cleanup = connectToStream();
    return cleanup;
  }, [connectToStream]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Редирект на главную для мобильных устройств
  useEffect(() => {
    if (isMobile) {
      navigate('/');
    }
  }, [isMobile, navigate]);

  // Если мобильное устройство, не рендерим компонент
  if (isMobile) {
    return null;
  }

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
        <Typography variant="h4" sx={{ mb: 2, color: 'primary.main', textAlign: 'center' }}>
          Стрим камер
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, mb: 3, justifyContent: 'center' }}>
          <Button
            variant="contained"
            startIcon={<StartAllIcon />}
            onClick={startAllCameras}
            disabled={isLoading}
          >
            Запустить все камеры
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<StopAllIcon />}
            onClick={stopAllCameras}
            disabled={isLoading}
          >
            Остановить все камеры
          </Button>
              <Tooltip title="Обновить список камер">
                <IconButton 
                  onClick={fetchCameras}
                  color="primary"
              disabled={isLoading}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
          </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
                <CircularProgress />
          </Box>
        ) : cameras.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              Камеры не найдены
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Убедитесь, что камеры подключены и доступны системе
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={3}>
            {cameras.map((camera) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={camera.id}>
                <CameraFrame 
                  camera={camera} 
                  frameData={streamData[camera.id]}
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