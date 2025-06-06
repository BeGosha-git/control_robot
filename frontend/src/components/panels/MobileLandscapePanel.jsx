import React, { memo } from 'react';
import { Box, Typography } from '@mui/material';
import StatusPanel from '../StatusPanel';
import LogViewer from '../LogViewer';
import InterruptButton from '../InterruptButton';
import CommandGroupLandscape from '../CommandGroupLandscape';

// Выносим стили в константы
const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    bgcolor: 'background.default'
  },
  leftPanel: {
    width: '18vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    bgcolor: 'background.paper',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    p: 1.5,
    gap: 1.5,
    position: 'relative'
  },
  statusIndicator: {
    width: 12,
    height: 12,
    minWidth: 12,
    minHeight: 12,
    borderRadius: '50%',
    transition: 'all 0.3s ease'
  }
};

const MobileLandscapePanel = memo(({
  robotName,
  robotStatus,
  isInterrupting,
  interruptCommand,
  commandResult,
  error,
  status,
  tagOrder,
  selectedTagIdx,
  setSelectedTagIdx,
  grouped,
  isExecuting,
  executeCommand,
  serverStatus
}) => {
  const getStatusIndicatorStyle = () => ({
    ...styles.statusIndicator,
    bgcolor: serverStatus === 'error' ? '#f44336' : '#4caf50',
    border: `1.5px solid ${serverStatus === 'error' ? '#d32f2f' : '#388e3c'}`,
    boxShadow: `0 0 0 1px ${serverStatus === 'error' ? 'rgba(244,67,54,0.15)' : 'rgba(76,175,80,0.15)'}`
  });

  return (
    <Box sx={styles.container}>
      {/* Левая панель (18vw): статус и логи */}
      <Box sx={styles.leftPanel}>
        {/* Фиксированный верхний блок */}
        <Box sx={{ 
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          flexShrink: 0
        }}>
          {/* Статус робота */}
          <Box sx={{ 
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 0.5
          }}>
            <Box sx={getStatusIndicatorStyle()} />
            <Typography variant="caption" sx={{ 
              fontWeight: 600, 
              color: 'primary.main',
              fontSize: '0.75rem',
              letterSpacing: 0.5,
              flex: 1
            }}>
              {robotName}
            </Typography>
          </Box>
          {/* Статус выполнения */}
          <Box sx={{ 
            width: '100%',
            flexShrink: 0
          }}>
            <StatusPanel
              status={robotStatus}
              interrupting={isInterrupting}
              onInterrupt={interruptCommand}
              compact={true}
            />
          </Box>
        </Box>

        {/* Остальное пространство */}
        <Box sx={{ 
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Здесь можно добавить дополнительный контент */}
        </Box>

        {/* Кнопка логов - фиксирована внизу слева */}
        <Box sx={{ 
          position: 'fixed',
          left: 12,
          bottom: 12,
          zIndex: 200,
          bgcolor: 'background.paper',
          borderRadius: '50%',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          pb: '20px'
        }}>
          <LogViewer 
            commandResult={commandResult} 
            error={error} 
            status={status}
            compact={true}
          />
        </Box>
      </Box>

      {/* Правая область (82vw): теги и команды */}
      <Box sx={{
        width: '82vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        position: 'relative',
        overflow: 'hidden',
        p: 1,
        pb: '50px'
      }}>
        {/* Теги - горизонтальная лента */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          mb: 2,
          gap: 1,
          overflowX: 'auto',
          '::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          pb: 1
        }}>
          {tagOrder.map((tag, idx) => (
            <Box
              key={tag}
              onClick={() => setSelectedTagIdx(idx)}
              sx={{
                px: 2,
                py: 1,
                borderRadius: 2,
                bgcolor: selectedTagIdx === idx ? 'primary.main' : 'rgba(255,255,255,0.05)',
                color: selectedTagIdx === idx ? '#fff' : 'text.secondary',
                fontWeight: 600,
                fontSize: '0.9rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: '1px solid',
                borderColor: selectedTagIdx === idx ? 'primary.main' : 'rgba(255,255,255,0.08)',
                '&:hover': {
                  bgcolor: selectedTagIdx === idx ? 'primary.dark' : 'rgba(255,255,255,0.08)',
                }
              }}
            >
              {tag}
            </Box>
          ))}
        </Box>

        {/* Матрица команд */}
        <Box sx={{ 
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          mb: 2
        }}>
          {tagOrder[selectedTagIdx] && (
            <CommandGroupLandscape
              tag={tagOrder[selectedTagIdx]}
              commands={grouped[tagOrder[selectedTagIdx]]}
              isProcessing={isExecuting || robotStatus?.isProcessing}
              currentCommand={robotStatus?.currentCommand}
              onExecute={executeCommand}
            />
          )}
        </Box>

        {/* Кнопка прерывания */}
        {robotStatus?.isProcessing && (
          <Box sx={{ 
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 200,
            bgcolor: 'background.paper',
            borderRadius: '50%',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            p: 0.5,
            pb: '20px'
          }}>
            <InterruptButton
              isProcessing={robotStatus?.isProcessing}
              interrupting={isInterrupting}
              onInterrupt={interruptCommand}
              compact={true}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
});

MobileLandscapePanel.displayName = 'MobileLandscapePanel';

export default MobileLandscapePanel; 