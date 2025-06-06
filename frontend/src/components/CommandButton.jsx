import React, { memo } from 'react';
import { Grid, Paper, Typography, CircularProgress } from '@mui/material';
import { PlayArrow as PlayArrowIcon } from '@mui/icons-material';

// Выносим стили в константы
const styles = {
  button: {
    p: { xs: 2, sm: 2.5 },
    mx: { xs: 0, sm: 1 },
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: { xs: 2, sm: 2.5 },
    position: 'relative',
    minHeight: { xs: 110, sm: 140, md: 170 },
    minWidth: { xs: 110, sm: 140, md: 170 },
    aspectRatio: '1',
    border: '1.5px solid rgba(255, 255, 255, 0.16)',
    borderRadius: { xs: 2, sm: 2.5 },
    transition: 'all 0.2s'
  },
  icon: {
    color: 'primary.main',
    fontSize: { xs: 40, sm: 48 },
    flexShrink: 0
  },
  text: {
    fontWeight: 700,
    fontSize: { xs: '1.15rem', sm: '1.25rem', md: '1.35rem' },
    flex: 1,
    lineHeight: 1.2,
    textAlign: 'center',
    mt: 1
  }
};

const CommandButton = memo(({ cmd, isProcessing, currentCommand, onExecute }) => (
  <Grid item xs={4}>
    <Paper 
      elevation={2} 
      onClick={() => !isProcessing && onExecute(cmd)}
      sx={{
        ...styles.button,
        cursor: isProcessing ? 'not-allowed' : 'pointer',
        opacity: isProcessing ? 0.7 : 1,
        '&:hover': {
          boxShadow: isProcessing ? 'none' : '0 0 0 2px #2196f3',
          transform: isProcessing ? 'none' : 'translateY(-1px)',
        },
        '&:active': {
          transform: isProcessing ? 'none' : 'translateY(1px)',
        }
      }}
    >
      <PlayArrowIcon sx={styles.icon} />
      <Typography variant="h6" sx={styles.text}>{cmd.name}</Typography>
      {currentCommand === cmd.id && (
        <CircularProgress size={28} sx={{ mt: 1, flexShrink: 0 }} />
      )}
    </Paper>
  </Grid>
));

CommandButton.displayName = 'CommandButton';

export default CommandButton; 