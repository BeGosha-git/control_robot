import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  Fade
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PowerSettingsNew as PowerIcon,
  Settings as SettingsIcon,
  SignalCellularAlt as SignalIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useRobot } from '../contexts/RobotContext';
import { useIsMobile } from '../hooks/useIsMobile';

const API_BASE_URL = '/api';

// Компонент карточки робота
const RobotCard = ({ robot, isServer, position, onRefresh }) => {
  const theme = useTheme();
  const isMobile = useIsMobile();

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'success';
      case 'offline': return 'error';
      case 'warning': return 'warning';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online': return <SuccessIcon />;
      case 'offline': return <ErrorIcon />;
      case 'warning': return <WarningIcon />;
      default: return <SignalIcon />;
    }
  };

  const cardStyle = {
    position: 'relative',
    padding: theme.spacing(3),
    borderRadius: theme.spacing(2),
    background: `linear-gradient(145deg, ${theme.palette.background.paper}, ${theme.palette.background.default})`,
    boxShadow: theme.shadows[8],
    transition: 'all 0.3s ease',
    transform: `scale(${isServer ? 1.2 : 1}) translateX(${position}px)`,
    zIndex: isServer ? 2 : 1,
    opacity: isServer ? 1 : 0.8,
    '&:hover': {
      transform: `scale(${isServer ? 1.25 : 1.05}) translateX(${position}px)`,
      opacity: 1,
      boxShadow: theme.shadows[12],
    },
    backdropFilter: 'blur(10px)',
    border: `1px solid ${theme.palette.divider}`,
  };

  const serverStyle = {
    ...cardStyle,
    background: `linear-gradient(145deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
    color: theme.palette.primary.contrastText,
  };

  return (
    <Fade in={true} timeout={1000}>
      <Paper sx={isServer ? serverStyle : cardStyle}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          mb: 2
        }}>
          <Typography variant="h5" sx={{ 
            fontWeight: 'bold',
            textShadow: isServer ? '0 0 10px rgba(255,255,255,0.5)' : 'none'
          }}>
            {robot.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Обновить статус">
              <IconButton 
                size="small" 
                onClick={() => onRefresh(robot.id)}
                sx={{ color: isServer ? 'inherit' : 'primary.main' }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            {!isServer && (
              <Tooltip title="Настройки">
                <IconButton 
                  size="small"
                  sx={{ color: 'primary.main' }}
                >
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 2,
          minHeight: 120
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            flexWrap: 'wrap'
          }}>
            <Chip
              icon={getStatusIcon(robot.status)}
              label={robot.status}
              color={getStatusColor(robot.status)}
              size="small"
              sx={{ 
                fontWeight: 'bold',
                '& .MuiChip-icon': { color: 'inherit' }
              }}
            />
            {robot.commands?.map((cmd, idx) => (
              <Chip
                key={idx}
                label={cmd.name}
                size="small"
                variant="outlined"
                sx={{ 
                  borderColor: cmd.status === 'success' ? 'success.main' : 
                             cmd.status === 'error' ? 'error.main' : 
                             'warning.main',
                  color: cmd.status === 'success' ? 'success.main' : 
                         cmd.status === 'error' ? 'error.main' : 
                         'warning.main',
                }}
              />
            ))}
          </Box>

          {isServer && (
            <Box sx={{ 
              mt: 2,
              p: 2,
              borderRadius: 1,
              bgcolor: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(5px)'
            }}>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Сервер управления роботами
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                IP: {robot.ip || 'localhost'}
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Fade>
  );
};

const RobotsPage = () => {
  const { robotName } = useRobot();
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const theme = useTheme();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchRobots();
  }, []);

  const fetchRobots = async () => {
    setLoading(true);
    try {
      // TODO: Заменить на реальный API endpoint
      const mockRobots = [
        {
          id: 'server',
          name: 'Управляющий сервер',
          status: 'online',
          ip: '192.168.1.100',
          isServer: true,
          commands: [
            { name: 'API', status: 'success' },
            { name: 'База данных', status: 'success' }
          ]
        },
        {
          id: 'current',
          name: robotName,
          status: 'online',
          commands: [
            { name: 'Движение', status: 'success' },
            { name: 'Сборка', status: 'warning' }
          ]
        },
        {
          id: 'robot2',
          name: 'Робот Beta',
          status: 'warning',
          commands: [
            { name: 'Движение', status: 'error' },
            { name: 'Сборка', status: 'success' }
          ]
        },
        {
          id: 'robot3',
          name: 'Робот Gamma',
          status: 'offline',
          commands: []
        }
      ];
      
      setRobots(mockRobots);
      setError(null);
    } catch (e) {
      setError('Ошибка загрузки списка роботов');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (robotId) => {
    // TODO: Реализовать обновление статуса конкретного робота
    console.log('Обновление статуса робота:', robotId);
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: `linear-gradient(45deg, ${theme.palette.background.default}, ${theme.palette.background.paper})`
      }}>
        <CircularProgress size={60} thickness={4} />
      </Box>
    );
  }

  return (
    <Box sx={{
      p: { xs: 2, sm: 4 },
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${theme.palette.background.default} 0%, ${theme.palette.background.paper} 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      overflow: 'auto'
    }}>
      <Typography 
        variant="h3" 
        sx={{ 
          textAlign: 'center', 
          mb: 6,
          fontWeight: 'bold',
          textShadow: '0 0 20px rgba(25,118,210,0.3)',
          color: theme.palette.primary.main
        }}
      >
        Панель управления роботами
      </Typography>

      <Grid 
        container 
        spacing={4} 
        justifyContent="center"
        sx={{ 
          perspective: '1000px',
          transformStyle: 'preserve-3d'
        }}
      >
        {robots.map((robot, index) => {
          const isServer = robot.isServer;
          const position = isServer ? 0 : 
                          index < robots.findIndex(r => r.isServer) ? -100 : 100;
          
          return (
            <Grid 
              item 
              xs={12} 
              sm={6} 
              md={isServer ? 6 : 4} 
              key={robot.id}
              sx={{
                display: 'flex',
                justifyContent: 'center',
                transform: `translateZ(${isServer ? 50 : 0}px)`,
                transition: 'all 0.5s ease'
              }}
            >
              <RobotCard 
                robot={robot}
                isServer={isServer}
                position={position}
                onRefresh={handleRefresh}
              />
            </Grid>
          );
        })}
      </Grid>

      {error && (
        <Box sx={{ 
          position: 'fixed', 
          bottom: 20, 
          left: '50%', 
          transform: 'translateX(-50%)',
          zIndex: 1000
        }}>
          <Paper 
            sx={{ 
              p: 2, 
              bgcolor: 'error.main', 
              color: 'error.contrastText',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <ErrorIcon />
            <Typography>{error}</Typography>
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default RobotsPage; 