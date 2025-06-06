import React, { Suspense, useRef, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Button, Typography, Container, Box, useMediaQuery, IconButton, Tooltip, Badge, Avatar, useTheme, Chip, CircularProgress } from '@mui/material';
import CommandPanel from './pages/CommandPanel';
import { RobotProvider, useRobot } from './contexts/RobotContext';
import LogViewer from './components/LogViewer';
import {
  HomeIcon,
  PrecisionManufacturingIcon,
  CodeIcon,
  DirectionsWalkIcon,
  SettingsIcon,
  VideocamIcon,
  StorageIcon,
  PlayArrowIcon,
  StopIcon
} from './utils/mui-imports';
import './App.css';
import { useIsMobile } from './hooks/useIsMobile';

// Ленивая загрузка страниц (все импорты должны быть до кода)
const EditorPage = React.lazy(() => import('./pages/EditorPage'));
const ConfigPage = React.lazy(() => import('./pages/ConfigPage'));
const MotionCreator = React.lazy(() => import('./pages/MotionCreator'));
const RobotsPage = React.lazy(() => import('./pages/RobotsPage'));
const CameraTest = React.lazy(() => import('./pages/CameraTest'));

function CommandStatus({ currentCommand, isProcessing, onInterrupt, robotConfig }) {
  const buttonName = useMemo(() => {
    if (!currentCommand || !robotConfig?.robotButtons) return currentCommand;
    const button = robotConfig.robotButtons.find(btn => btn.command === currentCommand);
    return button ? button.name : currentCommand;
  }, [currentCommand, robotConfig]);

  if (!currentCommand || !isProcessing) return null;

  return (
    <Tooltip 
      title={`Выполняется: ${buttonName}`}
      arrow
      placement="bottom"
    >
      <Chip
        icon={<CircularProgress size={16} color="inherit" />}
        label={buttonName}
        onDelete={onInterrupt}
        deleteIcon={<StopIcon />}
        color="primary"
        variant="outlined"
        sx={{
          height: 32,
          '& .MuiChip-label': {
            px: 1,
            fontWeight: 500,
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          },
          '& .MuiChip-deleteIcon': {
            color: 'error.main',
            '&:hover': {
              color: 'error.dark'
            }
          },
          borderColor: 'primary.main',
          backgroundColor: 'rgba(25,118,210,0.08)',
          '&:hover': {
            backgroundColor: 'rgba(25,118,210,0.12)'
          }
        }}
      />
    </Tooltip>
  );
}

function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    robotName, 
    commandResult, 
    error, 
    status,
    robotStatus,
    isExecuting,
    interruptCommand,
    robotConfig,
    serverStatus
  } = useRobot();
  const theme = useTheme();

  const menuItems = [
    { path: '/', label: 'Главная', icon: <HomeIcon /> },
    { path: '/robots', label: 'Роботы', icon: <PrecisionManufacturingIcon /> },
    { path: '/editor', label: 'Редактор', icon: <CodeIcon /> },
    { path: '/motion', label: 'Движения', icon: <DirectionsWalkIcon /> },
    { path: '/config', label: 'Конфиг', icon: <SettingsIcon /> },
    { path: '/camera', label: 'Камера', icon: <VideocamIcon /> }
  ];

  return (
    <AppBar 
      position="static" 
      sx={{ 
        background: 'linear-gradient(90deg, rgba(25,118,210,0.05) 0%, rgba(25,118,210,0.02) 100%)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      '@media (max-width: 600px)': {
          display: 'none'
      }
      }}
    >
      <Toolbar sx={{ 
        minHeight: 72,
        px: { xs: 2, sm: 3 },
        display: 'flex',
        alignItems: 'center',
        gap: 2
      }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          flexGrow: 1
        }}>
          <Typography 
            variant="h6" 
            sx={{ 
              color: 'primary.main',
              fontWeight: 700,
              fontSize: '1.25rem',
              letterSpacing: '0.5px',
              background: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            H-Control
          </Typography>
        </Box>

        <Box sx={{ 
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mx: 2
        }}>
          <CommandStatus 
            currentCommand={robotStatus?.currentCommand}
            isProcessing={robotStatus?.isProcessing || isExecuting}
            onInterrupt={interruptCommand}
            robotConfig={robotConfig}
          />
        </Box>

        <Box sx={{ 
          display: 'flex',
          gap: 0.5,
          mx: 2,
          '& .MuiButton-root': {
            minWidth: 'auto',
            px: 2,
            py: 1.5,
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden',
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: 0,
              left: '50%',
              width: 0,
              height: 2,
              background: 'primary.main',
              transition: 'all 0.3s ease',
              transform: 'translateX(-50%)'
            },
            '&:hover::after': {
              width: '80%'
            }
          }
        }}>
          {menuItems.map((item) => (
            <Tooltip 
              key={item.path} 
              title={item.label}
              placement="bottom"
              arrow
            >
          <Button 
            color="inherit" 
                onClick={() => navigate(item.path)}
            sx={{ 
                  color: location.pathname === item.path ? 'primary.main' : 'text.secondary',
                  backgroundColor: location.pathname === item.path 
                    ? 'rgba(25,118,210,0.08)' 
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: 'rgba(25,118,210,0.12)',
                    color: 'primary.main'
                  },
                  '& .MuiSvgIcon-root': {
                    fontSize: '1.25rem',
                    mr: 1
                  }
            }}
          >
                {item.icon}
                {item.label}
          </Button>
            </Tooltip>
          ))}
        </Box>

        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2,
          ml: 'auto'
        }}>
          <LogViewer 
            commandResult={commandResult}
            error={error}
            status={status}
          />
          <Tooltip 
            title={serverStatus === 'error' ? 'Нет связи с сервером' : 'Статус: Подключено'}
            arrow
            placement="bottom"
          >
            <Badge
              overlap="circular"
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              variant="dot"
              sx={{
                '& .MuiBadge-badge': {
                  backgroundColor: serverStatus === 'error' ? '#f44336' : '#4caf50',
                  boxShadow: '0 0 0 2px rgba(255,255,255,0.1)'
                }
              }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: 'rgba(25,118,210,0.1)',
                  color: 'primary.main',
                  border: '2px solid',
                  borderColor: 'primary.main',
                  boxShadow: '0 2px 8px rgba(25,118,210,0.2)'
                }}
              >
                <StorageIcon />
              </Avatar>
            </Badge>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isLandscape = useMediaQuery('(orientation: landscape)');

  useEffect(() => {
    // Если это мобильное устройство и пользователь пытается перейти на страницу, отличную от главной
    if (isMobile && location.pathname !== '/') {
      navigate('/');
    }
  }, [isMobile, location.pathname, navigate]);

  // Если это мобильное устройство и не горизонтальный режим, показываем предупреждение
  if (isMobile && !isLandscape) {
  return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          textAlign: 'center',
          bgcolor: 'background.default'
        }}
      >
        <Typography variant="h5" color="primary" gutterBottom>
          Пожалуйста, поверните устройство горизонтально
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Для оптимальной работы приложения используйте горизонтальный режим
        </Typography>
      </Box>
    );
    }

  // Для мобильных устройств в горизонтальном режиме показываем только главную страницу без шапки
  if (isMobile) {
    return (
      <Box sx={{ 
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        bgcolor: 'background.default'
      }}>
        <CommandPanel isMobile={true} isLandscape={true} />
      </Box>
    );
  }

  // Для десктопа показываем полный интерфейс
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      minHeight: '100vh',
      bgcolor: 'background.default'
    }}>
      <Header />
      <Container 
        maxWidth={false} 
        sx={{ 
          flexGrow: 1,
          py: 3,
          px: { xs: 2, sm: 3 }
        }}
      >
        <Suspense fallback={
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            height: '100%',
            minHeight: '200px'
          }}>
            <CircularProgress />
          </Box>
        }>
          <Outlet />
        </Suspense>
      </Container>
    </Box>
    );
  }

function App() {
  return (
    <RobotProvider>
      <Router>
          <Routes>
            <Route path="/" element={<Layout />}>
            <Route index element={<CommandPanel />} />
            {/* Остальные маршруты доступны только на десктопе */}
              <Route path="robots" element={<RobotsPage />} />
              <Route path="editor" element={<EditorPage />} />
              <Route path="motion" element={<MotionCreator />} />
              <Route path="config" element={<ConfigPage />} />
              <Route path="camera" element={<CameraTest />} />
            </Route>
          </Routes>
      </Router>
    </RobotProvider>
  );
}

export default App; 