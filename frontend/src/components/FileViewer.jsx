import { useState, useMemo } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  Snackbar, 
  Alert,
  Tab,
  Tabs
} from '@mui/material';
import { TabContext, TabList } from '@mui/lab';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import CodeEditor from './CodeEditor';
import ImagePreview from './ImagePreview';
import api from '../services/api';

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];

function isImageFile(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return imageExtensions.includes(ext);
}

const FileViewer = ({
  tabs = [],
  activeTab,
  onTabChange,
  onTabClose,
  onFileSave,
  onEditorChange,
  onTabsReorder,
  selectedFile,
  fileContent,
  robotButtons = []
}) => {
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const [draggedTab, setDraggedTab] = useState(null);

  // Кэшируем URL изображения
  const imageUrl = useMemo(() => {
    if (!selectedFile || !isImageFile(selectedFile)) return '';
    return api.downloadFile(selectedFile);
  }, [selectedFile]);

  // build/reset кнопки
  const buildButtons = robotButtons.filter(b => (b.tag || '').toLowerCase().includes('build'));
  const resetButtons = robotButtons.filter(b => (b.tag || '').toLowerCase().includes('reset') || (b.name || '').toLowerCase().includes('сброс'));

  const handleTabDragStart = (e, path) => {
    setDraggedTab(path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTabDragOver = (e, overPath) => {
    e.preventDefault();
    if (draggedTab && draggedTab !== overPath) {
      const from = tabs.findIndex(tab => tab.path === draggedTab);
      const to = tabs.findIndex(tab => tab.path === overPath);
      if (from !== -1 && to !== -1) {
        const newTabs = [...tabs];
        newTabs.splice(from, 1);
        newTabs.splice(to, 0, tabs[from]);
        onTabsReorder(newTabs.map(tab => tab.path));
      }
    }
  };

  const handleTabDrop = () => {
    setDraggedTab(null);
  };

  const showNotification = (message, severity = 'info') => {
    setNotification({ open: true, message, severity });
  };
  
  const handleCloseNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
  };

  const handleExecuteCommand = async (btn) => {
    if (btn.command) {
      try {
        const response = await api.executeCommand(btn.command);
        showNotification('Команда успешно выполнена', 'success');
      } catch (error) {
        console.error('Ошибка при выполнении команды:', error);
        showNotification(
          `Ошибка при выполнении команды: ${error.response?.data?.error || error.message}`,
          'error'
        );
      }
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      bgcolor: 'background.default', 
      color: 'text.primary'
    }}>
      {tabs.length > 0 && (
        <TabContext value={activeTab || ''}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            minWidth: 0, 
            width: '100%',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            bgcolor: 'rgba(26, 26, 26, 0.95)',
            backdropFilter: 'blur(10px)',
            height: 48
          }}>
            <TabList
              onChange={onTabChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                borderBottom: 'none',
                '& .MuiTab-root': {
                  minHeight: 48,
                  textTransform: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                  color: 'text.secondary',
                  borderBottom: '2px solid transparent',
                  transition: 'all 0.2s ease',
                  px: 2,
                  '&.Mui-selected': {
                    color: 'primary.main',
                    fontWeight: 500,
                    borderBottom: '2px solid',
                    borderColor: 'primary.main',
                    bgcolor: 'rgba(144, 202, 249, 0.08)'
                  },
                  '&:hover': {
                    color: 'primary.main',
                    bgcolor: 'rgba(144, 202, 249, 0.08)'
                  }
                }
              }}
            >
              {tabs.map(tab => (
                <Tab
                  key={tab.path}
                  label={
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1,
                      px: 1,
                      minWidth: 0
                    }}>
                      <InsertDriveFileIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                      <Typography 
                        noWrap 
                        sx={{ 
                          fontSize: '0.875rem',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {tab.path.split('/').pop()}
                      </Typography>
                      <Box
                        component="span"
                        onClick={e => {
                          e.stopPropagation();
                          onTabClose(e, tab.path);
                        }}
                        sx={{
                          ml: 1,
                          p: 0.25,
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          flexShrink: 0,
                          '&:hover': { 
                            bgcolor: 'rgba(255,255,255,0.1)',
                            transform: 'scale(1.1)'
                          }
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </Box>
                    </Box>
                  }
                  value={tab.path}
                  draggable
                  onDragStart={e => handleTabDragStart(e, tab.path)}
                  onDragOver={e => handleTabDragOver(e, tab.path)}
                  onDrop={handleTabDrop}
                />
              ))}
            </TabList>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              ml: 1,
              pr: 2,
              gap: 1,
              flexShrink: 0
            }}>
              {[...buildButtons, ...resetButtons, ...robotButtons.filter(b => !buildButtons.includes(b) && !resetButtons.includes(b))].map(btn => (
                <Button
                  key={btn.id}
                  variant="text"
                  size="small"
                  startIcon={<PlayArrowIcon sx={{ color: '#fff' }} />}
                  sx={{
                    backgroundColor: 'rgba(35, 39, 47, 0.8)',
                    color: '#b0b0b0',
                    borderRadius: '6px',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    padding: '6px 16px',
                    textTransform: 'none',
                    boxShadow: 'none',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      backgroundColor: 'rgba(45, 49, 58, 0.9)',
                      color: '#e0e0e0',
                      transform: 'translateY(-1px)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    },
                  }}
                  onClick={() => handleExecuteCommand(btn)}
                >
                  {btn.name}
                </Button>
              ))}
            </Box>
          </Box>
        </TabContext>
      )}
      <Box sx={{ 
        flex: 1, 
        minHeight: 0, 
        minWidth: 0, 
        width: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden', 
        p: 0, 
        m: 0,
        bgcolor: 'background.default'
      }}>
        {selectedFile ? (
          isImageFile(selectedFile) ? (
            <ImagePreview src={imageUrl} alt={selectedFile} />
          ) : (
            <CodeEditor 
              selectedFile={selectedFile}
              fileContent={fileContent}
              onEditorChange={onEditorChange}
              robotButtons={robotButtons}
            />
          )
        ) : (
          <Box sx={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 2,
            color: 'text.secondary',
            bgcolor: 'rgba(26, 26, 26, 0.95)',
            backdropFilter: 'blur(10px)'
          }}>
            <InsertDriveFileIcon sx={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant="h6" sx={{ opacity: 0.7 }}>
              Выберите файл в дереве слева
            </Typography>
          </Box>
        )}
      </Box>
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity} 
          sx={{ 
            width: '100%',
            backdropFilter: 'blur(10px)',
            bgcolor: 'rgba(26, 26, 26, 0.95)',
            '& .MuiAlert-icon': {
              color: notification.severity === 'error' ? '#f44336' : '#4caf50'
            }
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FileViewer; 