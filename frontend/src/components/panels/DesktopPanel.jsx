import React, { memo } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { ArrowBackIosNew as ArrowBackIosNewIcon, ArrowForwardIos as ArrowForwardIosIcon } from '@mui/icons-material';
import StatusPanel from '../StatusPanel';
import LogViewer from '../LogViewer';
import InterruptButton from '../InterruptButton';
import CommandGroup from '../CommandGroup';

// Выносим стили в константы
const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    bgcolor: 'background.default',
    position: 'relative'
  },
  topPanel: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: props => props.isMobile ? 1 : 2,
    p: props => props.isMobile ? 1.5 : 2,
    bgcolor: 'background.paper',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'relative',
    zIndex: 10
  },
  statusIndicator: {
    width: props => props.isMobile ? 12 : 14,
    height: props => props.isMobile ? 12 : 14,
    minWidth: props => props.isMobile ? 12 : 14,
    minHeight: props => props.isMobile ? 12 : 14,
    borderRadius: '50%',
    transition: 'all 0.3s ease'
  }
};

const DesktopPanel = memo(({
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
  isMobile,
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
      <Box sx={{...styles.topPanel, isMobile}}>
        {/* Статус робота и логи */}
        <Box sx={{
          width: '100%',
          maxWidth: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 1 : 2
        }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 1 : 1.5
          }}>
            <Box sx={{...getStatusIndicatorStyle(), isMobile}} />
            <Typography variant={isMobile ? "subtitle1" : "h5"} sx={{ 
              fontWeight: 700, 
              color: 'primary.main',
              letterSpacing: 1,
              fontSize: isMobile ? '1rem' : '1.25rem'
            }}>
              {robotName}
            </Typography>
          </Box>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 1 : 2
          }}>
            <StatusPanel
              status={robotStatus}
              interrupting={isInterrupting}
              onInterrupt={interruptCommand}
              compact={isMobile}
            />
            {isMobile && (
              <LogViewer 
                commandResult={commandResult} 
                error={error} 
                status={status}
                compact={true}
              />
            )}
          </Box>
        </Box>

        {/* Теги - горизонтальная лента */}
        <Box sx={{
          width: '100%',
          maxWidth: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          position: 'relative'
        }}>
          <IconButton
            onClick={() => setSelectedTagIdx(idx => Math.max(0, idx - 1))}
            disabled={selectedTagIdx === 0}
            sx={{
              minWidth: isMobile ? 32 : 40,
              minHeight: isMobile ? 32 : 40,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.05)',
              color: 'primary.main',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.08)',
              },
              '&.Mui-disabled': {
                bgcolor: 'rgba(255,255,255,0.02)',
                color: 'text.disabled',
              }
            }}
          >
            <ArrowBackIosNewIcon sx={{ fontSize: isMobile ? 16 : 20 }} />
          </IconButton>

          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            overflowX: 'auto',
            px: 1,
            '::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            maxWidth: `calc(100% - ${isMobile ? 80 : 100}px)`
          }}>
            {tagOrder.map((tag, idx) => (
              <Box
                key={tag}
                onClick={() => setSelectedTagIdx(idx)}
                sx={{
                  px: isMobile ? 1.5 : 2,
                  py: isMobile ? 0.75 : 1,
                  borderRadius: 2,
                  bgcolor: selectedTagIdx === idx ? 'primary.main' : 'rgba(255,255,255,0.05)',
                  color: selectedTagIdx === idx ? '#fff' : 'text.secondary',
                  fontWeight: 600,
                  fontSize: isMobile ? '0.8rem' : '0.9rem',
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

          <IconButton
            onClick={() => setSelectedTagIdx(idx => Math.min(tagOrder.length - 1, idx + 1))}
            disabled={selectedTagIdx === tagOrder.length - 1}
            sx={{
              minWidth: isMobile ? 32 : 40,
              minHeight: isMobile ? 32 : 40,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.05)',
              color: 'primary.main',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.08)',
              },
              '&.Mui-disabled': {
                bgcolor: 'rgba(255,255,255,0.02)',
                color: 'text.disabled',
              }
            }}
          >
            <ArrowForwardIosIcon sx={{ fontSize: isMobile ? 16 : 20 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Основная область с командами */}
      <Box sx={{ 
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: isMobile ? 1.5 : 2,
        overflow: 'hidden',
        position: 'relative'
      }}>
        <Box sx={{
          width: '100%',
          maxWidth: 900,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {tagOrder[selectedTagIdx] && (
            <CommandGroup
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
            right: isMobile ? 16 : 24,
            bottom: isMobile ? 16 : 24,
            zIndex: 2000,
            bgcolor: 'background.paper',
            borderRadius: '50%',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            p: 0.5
          }}>
            <InterruptButton
              isProcessing={robotStatus?.isProcessing}
              interrupting={isInterrupting}
              onInterrupt={interruptCommand}
              compact={isMobile}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
});

DesktopPanel.displayName = 'DesktopPanel';

export default DesktopPanel; 