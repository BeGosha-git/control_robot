import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Button, CircularProgress, Snackbar, Alert, Grid, Paper, Tabs, Tab } from '@mui/material';
import { PlayArrow as PlayArrowIcon, Stop as StopIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, ArrowBackIosNew as ArrowBackIosNewIcon, ArrowForwardIos as ArrowForwardIosIcon } from '@mui/icons-material';
import { TextField, IconButton } from '@mui/material';
import CommandGroup from '../components/CommandGroup';
import StatusPanel from '../components/StatusPanel';
import InterruptButton from '../components/InterruptButton';
import { styles } from '../styles/CommandPanel.styles';
import { useRobot } from '../contexts/RobotContext';
import LogViewer from '../components/LogViewer';
import MobileLandscapePanel from '../components/panels/MobileLandscapePanel';
import DesktopPanel from '../components/panels/DesktopPanel';
import { groupButtonsByTag, filterRobotButtons } from '../utils/commandUtils';

const API_BASE_URL = '/api';

// Выносим компоненты в отдельные файлы
const CommandButton = memo(({ cmd, isProcessing, currentCommand, onExecute }) => (
  <Grid item xs={12} sm={6} md={4}>
      <Paper 
        elevation={2} 
      onClick={() => !isProcessing && onExecute(cmd)}
                    sx={{ 
                      p: { xs: 1.5, sm: 2 },
                      mx: { xs: 0, sm: 1 },
                      display: 'flex', 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      gap: { xs: 1.5, sm: 2 },
                      position: 'relative', 
                      minHeight: { xs: 56, sm: 60 },
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: { xs: 1, sm: 1.5 },
        cursor: isProcessing ? 'not-allowed' : 'pointer',
        opacity: isProcessing ? 0.7 : 1,
                      transition: 'all 0.2s',
                      '&:hover': {
          boxShadow: isProcessing ? 'none' : '0 0 0 2px #2196f3',
          transform: isProcessing ? 'none' : 'translateY(-1px)',
                      },
                      '&:active': {
          transform: isProcessing ? 'none' : 'translateY(1px)',
                      }
                    }}
                  >
                    <PlayArrowIcon sx={{ 
                      color: 'primary.main', 
                      fontSize: { xs: 24, sm: 28 },
                      flexShrink: 0
                    }} />
                    <Typography variant="h6" sx={{ 
                      fontWeight: 600, 
                      fontSize: { xs: '1rem', sm: '0.92rem' },
                      flex: 1,
                      lineHeight: 1.2
                    }}>{cmd.name}</Typography>
                    {currentCommand === cmd.id && (
                      <CircularProgress size={20} sx={{ ml: 1, flexShrink: 0 }} />
                    )}
                  </Paper>
                </Grid>
));

// TopBar — выносим в отдельный компонент
const TopBar = memo(({ robotName, commandResult, error, status }) => (
  <Box sx={{
    width: '100%',
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    px: 2,
    pt: 1,
    pb: 1,
    position: 'relative',
    zIndex: 120,
    bgcolor: 'background.paper',
    borderBottom: '1.5px solid rgba(255,255,255,0.10)'
  }}>
    <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: 1 }}>
      {robotName}
    </Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <LogViewer commandResult={commandResult} error={error} status={status} />
      <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: '#4caf50', border: '2px solid #388e3c', boxShadow: '0 0 0 2px rgba(76,175,80,0.15)' }} />
    </Box>
  </Box>
));

// StatusBar — объединённая панель для горизонтального режима
const StatusBarLandscape = memo(({ robotName, commandResult, error, status, robotStatus, isInterrupting, interruptCommand }) => (
  <Box sx={{
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '80vh',
    maxWidth: 340,
    minWidth: 180,
    p: 1.5,
    bgcolor: 'background.paper',
    borderRadius: 2,
    border: '1.5px solid rgba(255,255,255,0.10)',
    boxShadow: 2,
    gap: 2,
  }}>
    <Typography variant="h6" sx={{
      fontWeight: 700,
      color: 'primary.main',
      letterSpacing: 1,
      minWidth: 80,
      alignSelf: 'center',
      transform: 'rotate(90deg)',
      whiteSpace: 'nowrap',
      mx: 1
    }}>
      {robotName}
    </Typography>
    <Box sx={{
      flex: 1,
      mx: 2,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 0,
      maxWidth: 220,
      transform: 'rotate(90deg)'
    }}>
      <Box sx={{ width: 200 }}>
        <StatusPanel
          status={robotStatus}
          interrupting={isInterrupting}
          onInterrupt={interruptCommand}
        />
      </Box>
    </Box>
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      transform: 'rotate(90deg)',
      mx: 1
    }}>
      <LogViewer commandResult={commandResult} error={error} status={status} />
      <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: '#4caf50', border: '2px solid #388e3c', boxShadow: '0 0 0 2px rgba(76,175,80,0.15)' }} />
    </Box>
  </Box>
));

const CommandPanel = ({ isMobile = false, isLandscape = false }) => {
  const { 
    robotName, 
    robotStatus, 
    isExecuting,
    isInterrupting,
    executeCommand,
    interruptCommand,
    robotConfig,
    commandResult,
    error,
    status,
    serverStatus
  } = useRobot();

  // Фильтруем и группируем кнопки
  const robotButtons = useMemo(() => filterRobotButtons(robotConfig), [robotConfig]);
  const grouped = useMemo(() => groupButtonsByTag(robotButtons), [robotButtons]);
  const tagOrder = useMemo(() => Object.keys(grouped).sort((a, b) => a.localeCompare(b)), [grouped]);

  // Состояние выбранного тега
  const [selectedTagIdx, setSelectedTagIdx] = useState(0);

  // Выбираем нужный компонент в зависимости от режима
  if (isMobile && isLandscape) {
    return (
      <MobileLandscapePanel
        robotName={robotName}
        robotStatus={robotStatus}
        isInterrupting={isInterrupting}
        interruptCommand={interruptCommand}
        commandResult={commandResult}
        error={error}
        status={status}
        tagOrder={tagOrder}
        selectedTagIdx={selectedTagIdx}
        setSelectedTagIdx={setSelectedTagIdx}
        grouped={grouped}
        isExecuting={isExecuting}
        executeCommand={executeCommand}
        serverStatus={serverStatus}
      />
    );
  }

  return (
    <DesktopPanel
      robotName={robotName}
      robotStatus={robotStatus}
      isInterrupting={isInterrupting}
      interruptCommand={interruptCommand}
      commandResult={commandResult}
      error={error}
      status={status}
      tagOrder={tagOrder}
      selectedTagIdx={selectedTagIdx}
      setSelectedTagIdx={setSelectedTagIdx}
      grouped={grouped}
      isExecuting={isExecuting}
      executeCommand={executeCommand}
      isMobile={isMobile}
      serverStatus={serverStatus}
    />
  );
};

export default memo(CommandPanel); 