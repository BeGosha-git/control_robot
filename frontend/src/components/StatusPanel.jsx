import React, { memo, useMemo } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import StopIcon from '@mui/icons-material/Stop';
import Chip from '@mui/material/Chip';

const StatusPanel = memo(({ 
  status, 
  interrupting,
  onInterrupt,
  compact = false
}) => {
  const statusText = useMemo(() => {
    if (status?.isProcessing) {
      return status?.currentCommand || 'Неизвестная команда';
    }
    return 'Готов к работе';
  }, [status?.isProcessing, status?.currentCommand]);

  const isProcessing = useMemo(() => status?.isProcessing || false, [status?.isProcessing]);

  return (
    <Chip
      icon={isProcessing ? <CircularProgress size={16} color="inherit" /> : null}
      label={statusText}
      onDelete={isProcessing ? onInterrupt : undefined}
      deleteIcon={isProcessing ? <StopIcon /> : undefined}
      color={isProcessing ? "primary" : "default"}
      variant="outlined"
      sx={{
        height: compact ? 28 : 32,
        '& .MuiChip-label': {
          px: 1,
          fontWeight: 500,
          maxWidth: compact ? 120 : 150,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: compact ? '0.75rem' : '0.85rem',
          color: isProcessing ? 'primary.main' : 'text.secondary'
        },
        '& .MuiChip-deleteIcon': {
          color: 'error.main',
          fontSize: compact ? 16 : 18,
          '&:hover': {
            color: 'error.dark'
          }
        },
        borderColor: isProcessing ? 'primary.main' : 'rgba(255,255,255,0.12)',
        backgroundColor: isProcessing ? 'rgba(25,118,210,0.08)' : 'rgba(255,255,255,0.03)',
        '&:hover': {
          backgroundColor: isProcessing ? 'rgba(25,118,210,0.12)' : 'rgba(255,255,255,0.05)'
        }
      }}
    />
  );
});

export default StatusPanel; 