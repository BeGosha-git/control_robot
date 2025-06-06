import React, { memo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import CommandButton from './CommandButton';
import IconButton from '@mui/material/IconButton';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

const PAGE_SIZE = 9;

const CommandGroup = memo(({ tag, commands, isProcessing, currentCommand, onExecute }) => {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(commands.length / PAGE_SIZE);

  const handlePrev = () => setPage((p) => Math.max(0, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages - 1, p + 1));

  const pageCommands = commands.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Box sx={{ mb: { xs: 1, sm: 1.5 }, width: '100%' }}>
      <Typography variant="h6" sx={{
        mb: { xs: 0.5, sm: 0.75 },
        color: 'primary.main',
        fontWeight: 600,
        textTransform: 'capitalize',
        fontSize: { xs: '0.95rem', sm: '0.98rem' },
        px: { xs: 0.5, sm: 0 }
      }}>{tag}</Typography>
      <Grid container spacing={{ xs: 1, sm: 1 }}>
        {Array.from({ length: PAGE_SIZE }).map((_, idx) => {
          const cmd = pageCommands[idx];
          return (
            <Grid item xs={4} key={cmd ? cmd.id : `empty-${idx}`}> {/* 3 на 3 */}
              {cmd && (
                <CommandButton
                  cmd={cmd}
                  isProcessing={isProcessing}
                  currentCommand={currentCommand}
                  onExecute={onExecute}
                />
              )}
            </Grid>
          );
        })}
      </Grid>
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 1 }}>
          <IconButton onClick={handlePrev} disabled={page === 0} size="small">
            <ArrowBackIosNewIcon fontSize="small" />
          </IconButton>
          <Typography sx={{ mx: 1, fontWeight: 500, fontSize: '1rem' }}>{page + 1} / {totalPages}</Typography>
          <IconButton onClick={handleNext} disabled={page === totalPages - 1} size="small">
            <ArrowForwardIosIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
});

export default CommandGroup; 