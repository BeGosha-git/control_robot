import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Drawer, ThemeProvider, Paper, Typography, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import FileExplorer from '../components/FileExplorer';
import FileViewer from '../components/FileViewer';
import { useFileSystem } from '../hooks/useFileSystem';
import { useTabs } from '../hooks/useTabs';
import { useRobot } from '../contexts/RobotContext';
import darkTheme from '../theme/darkTheme';
import { useIsMobile } from '../hooks/useIsMobile';

const EditorPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { robotName, robotButtons } = useRobot();
  const [drawerWidth, setDrawerWidth] = useState(320);
  const [expandedPaths, setExpandedPaths] = useState([]);
  const drawerRef = useRef(null);
  const isResizing = useRef(false);
  const isMobile = useIsMobile();

  const { 
    files,
    currentPath,
    rootPath,
    fetchFileTree,
    handleDirectorySelect,
    handleAfterDelete
  } = useFileSystem();

  const {
    openTabs,
    activeTab,
    handleTabChange,
    handleCloseTab,
    handleFileSave,
    handleEditorChange,
    handleTabsReorder,
    handleFileSelect: handleTabFileSelect
  } = useTabs();

  const handleFileSelect = useCallback(async (path) => {
    if (!path) return;
    try {
      await handleTabFileSelect(path);
      // После успешного открытия файла обновляем дерево файлов
      fetchFileTree();
    } catch (error) {
      console.error('Ошибка при открытии файла:', error);
    }
  }, [handleTabFileSelect, fetchFileTree]);

  const handlePathToggle = useCallback((path) => {
    setExpandedPaths(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  }, []);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing.current) return;
    const newWidth = e.clientX;
    if (newWidth > 280 && newWidth < window.innerWidth * 0.5) {
      setDrawerWidth(newWidth);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  useEffect(() => {
    fetchFileTree();
  }, [fetchFileTree]);

  // Редирект на главную для мобильных устройств
  useEffect(() => {
    if (isMobile) {
      navigate('/');
    }
  }, [isMobile, navigate]);

  return (
    <ThemeProvider theme={darkTheme}>
      <Box sx={{ 
        display: 'flex', 
        height: '85vh', 
        width: '100vw', 
        overflow: 'hidden',
        position: 'relative',
        bgcolor: 'background.default',
        color: 'text.primary',
      }}>
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              background: 'rgba(26, 26, 26, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              height: 'calc(100vh - 72px)',
              mt: '72px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }
          }}
          ref={drawerRef}
        >
              <FileExplorer 
                files={files}
                onFileSelect={handleFileSelect}
                onDirectorySelect={handleDirectorySelect}
                currentPath={currentPath}
                rootPath={rootPath}
                selectedFile={activeTab}
                fetchFileTree={fetchFileTree}
                drawerWidth={drawerWidth}
                onAfterDelete={handleAfterDelete}
                expandedPaths={expandedPaths}
                onPathToggle={handlePathToggle}
              />
            <Box
              onMouseDown={handleMouseDown}
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
              width: 4,
                height: '100%',
                cursor: 'col-resize',
                zIndex: 10,
                background: 'transparent',
              '&:hover': { 
                background: 'rgba(144,202,249,0.2)',
                width: 6,
                transition: 'width 0.2s ease'
              }
              }}
            />
        </Drawer>

        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
          bgcolor: 'background.default',
          position: 'relative'
        }}>
          <FileViewer 
            tabs={openTabs || []}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabClose={handleCloseTab}
            onFileSave={handleFileSave}
            onEditorChange={handleEditorChange}
            onTabsReorder={handleTabsReorder}
            selectedFile={activeTab}
            fileContent={openTabs?.find(tab => tab.path === activeTab)?.content}
            robotButtons={robotButtons}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default React.memo(EditorPage); 