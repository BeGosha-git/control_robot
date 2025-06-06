import React, { memo } from 'react';
import IconButton from '@mui/material/IconButton';
import StopIcon from '@mui/icons-material/Stop';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

const InterruptButton = memo(({ 
  isProcessing, 
  interrupting, 
  onInterrupt,
  compact = false
}) => {
  if (!isProcessing) return null;

  return (
    <Tooltip title="Прервать выполнение" arrow placement="top">
      <IconButton
        onClick={onInterrupt}
        disabled={interrupting}
        sx={{
          width: compact ? 40 : 56,
          height: compact ? 40 : 56,
          bgcolor: 'error.main',
          color: '#fff',
          boxShadow: '0 2px 8px rgba(244,67,54,0.3)',
          '&:hover': {
            bgcolor: 'error.dark',
            boxShadow: '0 4px 12px rgba(244,67,54,0.4)'
          },
          '&:active': {
            transform: 'translateY(1px)',
            boxShadow: '0 1px 4px rgba(244,67,54,0.2)'
          },
          '&.Mui-disabled': {
            bgcolor: 'rgba(244,67,54,0.5)',
            color: 'rgba(255,255,255,0.7)'
          }
        }}
      >
        {interrupting ? (
          <CircularProgress size={compact ? 20 : 24} color="inherit" />
        ) : (
          <StopIcon sx={{ fontSize: compact ? 20 : 24 }} />
        )}
      </IconButton>
    </Tooltip>
  );
});

export default InterruptButton; 