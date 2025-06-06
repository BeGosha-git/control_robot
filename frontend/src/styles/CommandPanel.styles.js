export const styles = {
  container: {
    p: { xs: 0.5, sm: 2 },
    pt: { xs: 0.5, sm: 1 },
    maxWidth: 900,
    margin: '0 auto',
    height: { xs: 'calc(100vh - 56px)', sm: '85vh' },
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
    '& textarea, & input': { userSelect: 'text' },
    '@media (max-width: 600px)': {
      '& .MuiPaper-root': {
        borderRadius: 1,
        p: { xs: 1, sm: 2 }
      }
    }
  },
  title: {
    mb: { xs: 1, sm: 2 },
    flexShrink: 0,
    fontSize: { xs: '1.3rem', sm: '2rem' },
    px: { xs: 1, sm: 0 }
  },
  robotName: {
    color: 'primary.main',
    fontWeight: 700,
    fontSize: { xs: '1.1em', sm: '1.2em' },
    ml: { xs: 0.5, sm: 2 }
  },
  commandsList: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    pb: { xs: 0.5, sm: 1 },
    px: { xs: 0.5, sm: 0 },
    '&::-webkit-scrollbar': {
      width: { xs: 4, sm: 8 },
      height: { xs: 4, sm: 8 }
    }
  }
};

export const scrollbarStyles = {
  width: { xs: 4, sm: 8 },
  height: { xs: 4, sm: 8 },
  '&::-webkit-scrollbar-track': {
    background: 'transparent'
  },
  '&::-webkit-scrollbar-thumb': {
    background: 'rgba(144, 202, 249, 0.3)',
    borderRadius: 4,
    '&:hover': {
      background: 'rgba(144, 202, 249, 0.5)'
    }
  }
};

export const errorScrollbarStyles = {
  ...scrollbarStyles,
  '&::-webkit-scrollbar-thumb': {
    background: 'rgba(244, 67, 54, 0.3)',
    borderRadius: 4,
    '&:hover': {
      background: 'rgba(244, 67, 54, 0.5)'
    }
  }
}; 