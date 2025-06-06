import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Videocam as CameraIcon,
  Settings as SettingsIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon
} from '@mui/icons-material';
import { useRobot } from '../contexts/RobotContext';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

const CameraTest = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isLandscape = useMediaQuery('(orientation: landscape)');
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const { robotName } = useRobot();

  // Мемоизированная функция получения списка камер
  const fetchCameras = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/cameras');
      const data = await response.json();
      setCameras(data.cameras);
    } catch (err) {
      console.error('Ошибка получения списка камер:', err);
      setError('Не удалось получить список камер');
    }
  }, []);

  // Мемоизированная функция смены камеры
  const handleCameraChange = useCallback(async (event) => {
    const newCameraIndex = event.target.value;
    try {
      const response = await fetch('http://localhost:3001/api/camera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceIndex: newCameraIndex }),
      });
      
      if (response.ok) {
        setSelectedCamera(newCameraIndex);
        if (wsRef.current) {
          wsRef.current.close();
        }
      } else {
        setError('Не удалось сменить камеру');
      }
    } catch (err) {
      console.error('Ошибка смены камеры:', err);
      setError('Ошибка смены камеры');
    }
  }, []);

  // Мемоизированная функция отрисовки кадра
  const drawFrame = useCallback((matrix) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(matrix[0].length, matrix.length);
    const data = imageData.data;

    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        const value = matrix[y][x];
        const i = (y * matrix[y].length + x) * 4;
        data[i] = value;     // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
        data[i + 3] = 255;   // A
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Мемоизированный рендер
  const renderContent = useMemo(() => (
    <Box
      ref={containerRef}
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
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(45deg, ${theme.palette.background.default}, ${theme.palette.background.paper})`,
        p: 3
      }}>
        <Typography variant="h4" sx={{ mb: 4, color: 'primary.main' }}>
          Стрим камеры
        </Typography>

        <Paper 
          elevation={3}
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            width: '100%',
            maxWidth: 800
          }}
        >
          <Box sx={{ 
            display: 'flex', 
            gap: 2, 
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2
          }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Выберите камеру</InputLabel>
              <Select
                value={selectedCamera}
                onChange={handleCameraChange}
                label="Выберите камеру"
                disabled={!isConnected || cameras.length === 0}
              >
                {cameras.length === 0 ? (
                  <MenuItem disabled>
                    Камеры не найдены
                  </MenuItem>
                ) : (
                  cameras.map((camera) => (
                    <MenuItem 
                      key={camera.id} 
                      value={camera.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      {camera.name}
                      {camera.isActive && (
                        <CameraIcon 
                          fontSize="small" 
                          color="primary"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Обновить список камер">
                <IconButton 
                  onClick={fetchCameras}
                  color="primary"
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Настройки камеры">
                <IconButton 
                  color="primary"
                  disabled={!isConnected || cameras.length === 0}
                >
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <Box sx={{ position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              style={{
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                background: '#000',
                width: '100%',
                height: 'auto'
              }}
            />
            {!isConnected && (
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
                <CircularProgress />
              </Box>
            )}
          </Box>

          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            mt: 2
          }}>
            <Typography 
              variant="body2" 
              sx={{ 
                color: isConnected ? 'success.main' : 'error.main',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <CameraIcon fontSize="small" />
              {isConnected ? 'Подключено' : 'Подключение...'}
            </Typography>

            {isStreaming && cameras.length > 0 && cameras[selectedCamera] && (
              <Typography 
                variant="body2" 
                sx={{ 
                  color: 'info.main',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                {cameras[selectedCamera].name}
                {cameras[selectedCamera].isActive && (
                  <CameraIcon 
                    fontSize="small" 
                    color="primary"
                  />
                )}
              </Typography>
            )}

            {cameras.length === 0 && (
              <Typography 
                variant="body2" 
                color="warning.main"
              >
                USB-камеры не найдены
              </Typography>
            )}
          </Box>

          {error && (
            <Typography 
              variant="body2" 
              color="error"
              sx={{ mt: 1 }}
            >
              {error}
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  ), [
    robotName,
    theme,
    selectedCamera,
    cameras,
    isConnected,
    isStreaming,
    error,
    handleCameraChange,
    fetchCameras
  ]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  useEffect(() => {
    const connectWebSocket = () => {
      const ws = new WebSocket('ws://localhost:3001/camera');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket подключен');
        setIsConnected(true);
        setError(null);
        setIsStreaming(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'frame') {
            drawFrame(data.data);
          } else if (data.type === 'devices') {
            setCameras(data.devices);
            if (data.activeCamera !== undefined && data.activeCamera !== -1) {
              setSelectedCamera(data.activeCamera);
            }
          }
        } catch (err) {
          console.error('Ошибка обработки сообщения:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        setError('Ошибка подключения к стриму');
        setIsConnected(false);
        setIsStreaming(false);
      };

      ws.onclose = () => {
        console.log('WebSocket отключен');
        setIsConnected(false);
        setIsStreaming(false);
        setTimeout(connectWebSocket, 2000);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [drawFrame]);

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

  return renderContent;
};

export default React.memo(CameraTest); 