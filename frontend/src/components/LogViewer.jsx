import React, { memo, useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import { CloseIcon, HistoryIcon, RefreshIcon } from '../utils/mui-imports';
import Badge from '@mui/material/Badge';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import CircularProgress from '@mui/material/CircularProgress';
import InfoIcon from '@mui/icons-material/Info';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import StorageIcon from '@mui/icons-material/Storage';

const LogViewer = memo(({ 
  commandResult, 
  error, 
  status,
  onClose,
  compact = false,
  hideIcon = false
}) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [backendLogs, setBackendLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const fetchBackendLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const response = await fetch('/api/logs');
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      const sortedLogs = (data.logs || []).sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      setBackendLogs(sortedLogs);
    } catch (err) {
      console.error('Error fetching backend logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (open && activeTab === 2) {
      fetchBackendLogs();
      const interval = setInterval(fetchBackendLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [open, activeTab]);

  const hasNewLogs = Boolean(commandResult || status?.lastResult);
  const hasNewErrors = Boolean(error || status?.error);

  const getStatusIcon = () => {
    if (error) return <ErrorIcon sx={{ color: 'error.main', fontSize: compact ? 16 : 20 }} />;
    if (status === 'success') return <CheckCircleIcon sx={{ color: 'success.main', fontSize: compact ? 16 : 20 }} />;
    return <InfoIcon sx={{ color: 'info.main', fontSize: compact ? 16 : 20 }} />;
  };

  const getStatusColor = () => {
    if (error) return 'error.main';
    if (status === 'success') return 'success.main';
    return 'info.main';
  };

  const getStatusText = () => {
    if (error) return error;
    if (commandResult?.text) return commandResult.text;
    if (status?.lastResult?.text) return status.lastResult.text;
    return 'Выполняется...';
  };

  if (hideIcon) return null;

  const styles = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

  return (
    <>
      <style>{styles}</style>
      <IconButton
        size="small"
        onClick={handleOpen}
        sx={{
          p: compact ? 0.5 : 1,
          color: getStatusColor(),
          bgcolor: 'background.paper',
          '&:hover': {
            bgcolor: 'rgba(255,255,255,0.08)'
          }
        }}
      >
        {getStatusIcon()}
      </IconButton>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            minHeight: '60vh',
            maxHeight: '80vh'
          }
        }}
      >
        <DialogTitle sx={{ 
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          pb: 1.5
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between' 
          }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Логи и статус
            </Typography>
            <IconButton
              onClick={handleClose}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            sx={{
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
                minWidth: 100
              }
            }}
          >
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ErrorIcon sx={{ fontSize: 20, color: hasNewErrors ? 'error.main' : 'inherit' }} />
                  <Typography>Ошибки</Typography>
                  {hasNewErrors && (
                    <Box sx={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      bgcolor: 'error.main' 
                    }} />
                  )}
                </Box>
              } 
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InfoIcon sx={{ fontSize: 20, color: hasNewLogs ? 'primary.main' : 'inherit' }} />
                  <Typography>Логи</Typography>
                  {hasNewLogs && (
                    <Box sx={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main' 
                    }} />
                  )}
                </Box>
              } 
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StorageIcon sx={{ fontSize: 20 }} />
                  <Typography>Системные</Typography>
                </Box>
              } 
            />
          </Tabs>

          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {activeTab === 0 && (error || status?.error) && (
              <Paper 
                elevation={0}
                sx={{ 
                  p: 2,
                  bgcolor: 'rgba(244,67,54,0.1)',
                  border: '1px solid rgba(244,67,54,0.2)',
                  borderRadius: 1,
                  mb: 2
                }}
              >
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    color: 'error.main',
                    fontWeight: 600,
                    mb: 1
                  }}
                >
                  Последняя ошибка:
                </Typography>
                <Typography 
                  sx={{ 
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'error.main',
                    fontSize: '0.9rem'
                  }}
                >
                  {error || status?.error}
                </Typography>
              </Paper>
            )}

            {activeTab === 1 && (commandResult || status?.lastResult) && (
              <Paper 
                elevation={0}
                sx={{ 
                  p: 2,
                  bgcolor: 'rgba(0,0,0,0.2)',
                  borderRadius: 1
                }}
              >
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    color: commandResult?.type === 'error' ? 'error.main' : 'primary.main',
                    fontWeight: 600,
                    mb: 1
                  }}
                >
                  Последний вывод:
                </Typography>
                <Typography 
                  sx={{ 
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: commandResult?.type === 'error' ? 'error.main' : 'text.primary',
                    fontSize: '0.9rem'
                  }}
                >
                  {commandResult?.text || status?.lastResult?.text}
                </Typography>
              </Paper>
            )}

            {activeTab === 2 && (
              <Box>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  mb: 2,
                  px: 1
                }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                    Системные логи
                  </Typography>
                  <IconButton 
                    onClick={fetchBackendLogs}
                    disabled={isLoadingLogs}
                    size="small"
                    sx={{ 
                      color: 'text.secondary',
                      '&:hover': { color: 'primary.main' }
                    }}
                  >
                    <RefreshIcon sx={{ 
                      fontSize: 20,
                      animation: isLoadingLogs ? 'spin 1s linear infinite' : 'none'
                    }} />
                  </IconButton>
                </Box>

                {isLoadingLogs && backendLogs.length === 0 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : backendLogs.length > 0 ? (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 1,
                    maxHeight: 'calc(100vh - 300px)',
                    overflowY: 'auto',
                    '::-webkit-scrollbar': {
                      width: 6,
                      height: 6
                    },
                    '::-webkit-scrollbar-thumb': {
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 3
                    },
                    '::-webkit-scrollbar-track': {
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: 3
                    }
                  }}>
                    {backendLogs.map((log, idx) => (
                      <Paper
                        key={`${log.timestamp}-${idx}`}
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: log.type === 'error' 
                            ? 'rgba(244,67,54,0.1)' 
                            : 'rgba(0,0,0,0.2)',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: log.type === 'error'
                            ? 'rgba(244,67,54,0.2)'
                            : 'rgba(255,255,255,0.08)'
                        }}
                      >
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          mb: 1,
                          gap: 1
                        }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {new Date(log.timestamp).toLocaleString()}
                          </Typography>
                          {log.type === 'error' && (
                            <ErrorIcon sx={{ 
                              color: 'error.main',
                              fontSize: 16,
                              flexShrink: 0
                            }} />
                          )}
                        </Box>
                        <Typography
                          sx={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            color: log.type === 'error' ? 'error.main' : 'text.primary',
                            fontSize: '0.9rem',
                            fontFamily: 'monospace',
                            lineHeight: 1.5
                          }}
                        >
                          {log.message}
                        </Typography>
                      </Paper>
                    ))}
                  </Box>
                ) : (
                  <Typography sx={{ 
                    color: 'text.secondary', 
                    textAlign: 'center', 
                    py: 4 
                  }}>
                    Нет системных логов
                  </Typography>
                )}
              </Box>
            )}

            {activeTab === 0 && !error && !status?.error && (
              <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                Нет ошибок
              </Typography>
            )}

            {activeTab === 1 && !commandResult && !status?.lastResult && (
              <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                Нет логов
              </Typography>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default LogViewer; 