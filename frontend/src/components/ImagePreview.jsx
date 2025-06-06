import { useState, memo } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';

const ImagePreview = memo(({ src, alt }) => {
  const [error, setError] = useState(false);

  const handleError = () => {
    setError(true);
  };

  if (error) {
    return (
      <Box sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#1a1a1a',
        flexDirection: 'column',
        gap: 2
      }}>
        <Typography color="error">
          Ошибка загрузки изображения
        </Typography>
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={() => setError(false)}
        >
          Попробовать снова
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: '#1a1a1a',
      overflow: 'auto',
      flexDirection: 'column',
    }}>
      <Box
        sx={{
          width: 600,
          height: 400,
          maxWidth: '90vw',
          maxHeight: '70vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#232323',
          borderRadius: 2,
          boxShadow: '0 2px 16px 0 rgba(0,0,0,0.4)',
          mb: 2,
        }}
      >
        <img
          src={src}
          alt={alt}
          onError={handleError}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 8,
            background: '#232323',
          }}
        />
      </Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="outlined" color="primary" size="small" href={src} target="_blank" rel="noopener noreferrer">
          Открыть в новой вкладке
        </Button>
        <Button variant="outlined" color="primary" size="small" href={src} download>
          Скачать
        </Button>
      </Stack>
    </Box>
  );
});

ImagePreview.displayName = 'ImagePreview';

export default ImagePreview; 