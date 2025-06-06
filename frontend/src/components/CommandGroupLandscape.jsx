import React, { memo } from 'react';
import { Grid, Paper, Typography, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const CommandGroupLandscape = memo(({ tag, commands, isProcessing, currentCommand, onExecute }) => {
  return (
    <Grid container spacing={1.5} sx={{ 
      width: '100%', 
      maxWidth: 600,
      px: 1
    }}>
      {commands.map((cmd) => (
        <Grid item xs={4} key={cmd.id}>
          <Paper 
            elevation={2}
            onClick={() => !isProcessing && onExecute(cmd)}
            sx={{ 
              p: 1.25,
              display: 'flex', 
              flexDirection: 'row', 
              alignItems: 'center', 
              gap: 0.75,
              position: 'relative', 
              minHeight: 56,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 1.5,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.7 : 1,
              transition: 'all 0.2s',
              bgcolor: 'background.paper',
              '&:hover': {
                boxShadow: isProcessing ? 'none' : '0 0 0 2px #2196f3',
                transform: isProcessing ? 'none' : 'translateY(-1px)',
                bgcolor: 'rgba(33, 150, 243, 0.08)',
              },
              '&:active': {
                transform: isProcessing ? 'none' : 'translateY(1px)',
                bgcolor: 'rgba(33, 150, 243, 0.12)',
              }
            }}
          >
            <PlayArrowIcon sx={{ 
              color: 'primary.main', 
              fontSize: 22,
              flexShrink: 0
            }} />
            <Typography variant="body2" sx={{ 
              fontWeight: 600, 
              fontSize: '0.85rem',
              flex: 1,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'text.primary'
            }}>
              {cmd.name}
            </Typography>
            {currentCommand === cmd.id && (
              <CircularProgress 
                size={18} 
                sx={{ 
                  ml: 0.5, 
                  flexShrink: 0,
                  color: 'primary.main'
                }} 
              />
            )}
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
});

export default CommandGroupLandscape; 