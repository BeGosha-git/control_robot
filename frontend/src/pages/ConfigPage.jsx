import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Snackbar, Alert, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, 
  DialogActions, Switch, FormControlLabel, Checkbox, FormGroup, Grid, Tooltip, Divider,
  DialogContentText, CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useRobot } from '../contexts/RobotContext';

const API_BASE_URL = '/api';

const defaultButton = { 
  id: '', 
  name: '', 
  command: '', 
  tag: '', 
  showOnMain: true, 
  showInEditor: true 
};

const tooltips = {
  name: 'Название кнопки, которое будет отображаться в интерфейсе',
  command: 'Команда, которая будет выполнена при нажатии на кнопку',
  tag: 'Тег для группировки кнопок (например: "движение", "настройка" и т.д.)',
  showOnMain: 'Показывать кнопку на главной странице',
  showInEditor: 'Показывать кнопку в редакторе',
  json: `Структура JSON конфигурации:
{
  "RobotName": "Имя робота",
  "rootPath": "Путь к корневой директории проекта",
  "sdkPath": "Путь к директории unitree_sdk2",
  "robotButtons": [
    {
      "id": "уникальный идентификатор",
      "name": "Название кнопки",
      "command": "Команда (можно использовать {sdkPath})",
      "tag": "Тег для группировки",
      "showOnMain": true/false,
      "showInEditor": true/false
    }
  ]
}`
};

const ConfigPage = () => {
  const { robotName, setRobotName, robotStatus } = useRobot();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, index: null, button: defaultButton });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, index: null });
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const [sdkPath, setSdkPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(true);

  // Выносим функцию fetchConfig за пределы useEffect
  const fetchConfig = useCallback(async () => {
    if (!isMounted) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/config`);
      if (!isMounted) return;
      
      const data = await res.json();
      // Нормализуем переносы строк в JSON
      const jsonString = JSON.stringify(data, null, 2).replace(/^\n+/, '');
      setConfig(data);
      setJsonValue(jsonString);
      setError(null);
      setRootPath(data.rootPath || '');
      setSdkPath(data.sdkPath || '/home/unitree/unitree_sdk2');
    } catch (e) {
      if (!isMounted) return;
      setError('Ошибка загрузки конфигурации');
    } finally {
      if (isMounted) {
      setLoading(false);
      }
    }
  }, [isMounted]);

  // Загрузка конфига только при монтировании компонента
  useEffect(() => {
    setIsMounted(true);
    fetchConfig();
    return () => {
      setIsMounted(false);
    };
  }, [fetchConfig]);

  // Обновляем конфиг при изменении статуса робота только если есть изменения
  useEffect(() => {
    if (robotStatus?.lastConfigUpdate) {
      fetchConfig();
    }
  }, [robotStatus?.lastConfigUpdate, fetchConfig]);

  const handleSave = async () => {
    if (!jsonMode) return;
    
    setSaving(true);
    try {
      const toSave = JSON.parse(jsonValue);
      const res = await fetch(`${API_BASE_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      if (!res.ok) throw new Error();
      setConfig(toSave);
      setRobotName(toSave.RobotName || 'H-0000');
      setSuccess(true);
      setError(null);
      setJsonValue(JSON.stringify(toSave, null, 2));
    } catch (e) {
      setError('Ошибка сохранения. Проверьте корректность JSON.');
    } finally {
      setSaving(false);
    }
  };

  const handleButtonSave = async (newButton, index) => {
    if (!newButton.name.trim() || !newButton.command.trim()) {
      setError('Название и команда обязательны для заполнения');
      return;
    }

    setSaving(true);
    try {
      const newButtons = [...(config.robotButtons || [])];
      if (index === null) {
        newButtons.push({ ...newButton, id: Date.now().toString() });
      } else {
        newButtons[index] = newButton;
      }
      
      const newConfig = { ...config, robotButtons: newButtons };
      const res = await fetch(`${API_BASE_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      
      if (!res.ok) throw new Error();
      setConfig(newConfig);
      setSuccess(true);
      setError(null);
      setEditDialog({ open: false, index: null, button: defaultButton });
    } catch (e) {
      setError('Ошибка сохранения кнопки');
    } finally {
      setSaving(false);
    }
  };

  const handleButtonDelete = async (index) => {
    setSaving(true);
    try {
      const newButtons = [...config.robotButtons];
      newButtons.splice(index, 1);
      
      const newConfig = { ...config, robotButtons: newButtons };
      const res = await fetch(`${API_BASE_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      
      if (!res.ok) throw new Error();
      setConfig(newConfig);
      setSuccess(true);
      setError(null);
      setDeleteDialog({ open: false, index: null });
    } catch (e) {
      setError('Ошибка удаления кнопки');
    } finally {
      setSaving(false);
    }
  };

  const isSystemButton = (button) => {
    return button.tag === 'build' || button.tag === 'reset';
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{
      p: { xs: 1, sm: 2 },
      pt: 1,
      maxWidth: 1200,
      margin: '0 auto',
      height: { xs: 'calc(100vh - 120px)', sm: '85vh' },
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      '& textarea, & input': { userSelect: 'text' }
    }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 2,
        flexWrap: 'wrap',
        gap: 1
    }}>
      <Typography variant="h4" sx={{ 
          fontSize: { xs: '1.5rem', sm: '2rem' },
          display: 'flex',
          alignItems: 'center',
          gap: 1
      }}>
        Конфигурация <Box component="span" sx={{ 
          color: 'primary.main', 
          fontWeight: 700, 
            fontSize: { xs: '1.1em', sm: '1.2em' }
        }}>{robotName}</Box>
      </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="Настройки системных кнопок">
            <IconButton 
              onClick={() => setSettingsOpen(true)} 
              color="primary"
              size="large"
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
      <FormControlLabel
            control={
              <Switch 
                checked={jsonMode} 
                onChange={e => setJsonMode(e.target.checked)}
                color="primary"
              />
            }
            label="Редактировать JSON"
          />
        </Box>
      </Box>

      {jsonMode ? (
        <>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', mb: 2 }}>
          <TextField
            multiline
            fullWidth
            value={jsonValue}
            onChange={e => setJsonValue(e.target.value)}
              error={!!error}
              helperText={error || tooltips.json}
            sx={{ 
              '& .MuiInputBase-root': { 
                height: '100%',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem'
              }
            }}
          />
        </Box>
          <Box sx={{
            display: 'flex',
            gap: 2,
            justifyContent: 'flex-end',
            position: 'sticky',
            bottom: 0,
            bgcolor: 'background.paper',
            zIndex: 20,
            py: 2,
            borderTop: '1px solid rgba(255, 255, 255, 0.12)'
          }}>
            <Button 
              variant="outlined" 
              onClick={() => {
                setJsonMode(false);
                setJsonValue(JSON.stringify(config, null, 2));
              }}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button 
              variant="contained" 
              onClick={async () => {
                setSaving(true);
                try {
                  const toSave = JSON.parse(jsonValue);
                  // Проверяем наличие обязательных полей
                  if (!toSave.RobotName || !toSave.rootPath || !toSave.sdkPath) {
                    throw new Error('Отсутствуют обязательные поля: RobotName, rootPath, sdkPath');
                  }
                  // Заменяем {sdkPath} в командах
                  if (toSave.robotButtons) {
                    toSave.robotButtons = toSave.robotButtons.map(btn => ({
                      ...btn,
                      command: btn.command.replace(/{sdkPath}/g, toSave.sdkPath)
                    }));
                  }
                  const res = await fetch(`${API_BASE_URL}/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(toSave),
                  });
                  if (!res.ok) throw new Error();
                  setConfig(toSave);
                  setSuccess(true);
                  setError(null);
                  setJsonValue(JSON.stringify(toSave, null, 2));
                } catch (e) {
                  setError(e.message || 'Ошибка сохранения. Проверьте корректность JSON.');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </Box>
        </>
      ) : (
        <>
          <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell>Команда</TableCell>
                  <TableCell>Тег</TableCell>
                  <TableCell align="center">Главная</TableCell>
                  <TableCell align="center">Редактор</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {config?.robotButtons?.map((button, index) => (
                  <TableRow key={button.id}>
                    <TableCell>{button.name}</TableCell>
                    <TableCell sx={{ 
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {button.command}
                    </TableCell>
                    <TableCell>{button.tag}</TableCell>
                    <TableCell align="center">
                      <Checkbox 
                        checked={button.showOnMain !== false} 
                        disabled 
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox 
                        checked={button.showInEditor !== false} 
                        disabled 
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {!isSystemButton(button) ? (
                        <>
                          <Tooltip title="Редактировать">
                            <IconButton 
                              onClick={() => setEditDialog({ 
                                open: true, 
                                index, 
                                button: { ...button } 
                              })}
                              size="small"
                            >
                        <EditIcon />
                      </IconButton>
                          </Tooltip>
                          <Tooltip title="Удалить">
                            <IconButton 
                              onClick={() => setDeleteDialog({ open: true, index })}
                              color="error"
                              size="small"
                            >
                        <DeleteIcon />
                      </IconButton>
                          </Tooltip>
                        </>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Системная кнопка
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

        <Box sx={{
            mt: 2, 
          display: 'flex',
          gap: 2,
          justifyContent: 'flex-end',
          position: 'sticky',
          bottom: 0,
          bgcolor: 'background.paper',
          zIndex: 20,
          py: 2,
          borderTop: '1px solid rgba(255, 255, 255, 0.12)'
        }}>
          <Button 
              startIcon={<AddIcon />}
              onClick={() => setEditDialog({ 
                open: true, 
                index: null, 
                button: defaultButton 
              })}
            variant="contained" 
          >
              Добавить кнопку
          </Button>
        </Box>
        </>
      )}

      {/* Диалог редактирования кнопки */}
      <Dialog 
        open={editDialog.open} 
        onClose={() => !saving && setEditDialog({ open: false, index: null, button: defaultButton })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editDialog.index === null ? 'Добавить кнопку' : 'Редактировать кнопку'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Название"
            value={editDialog.button.name}
              onChange={e => setEditDialog({ 
                ...editDialog, 
                button: { ...editDialog.button, name: e.target.value } 
              })}
            fullWidth
              required
              error={!editDialog.button.name.trim()}
              helperText={!editDialog.button.name.trim() ? 'Обязательное поле' : tooltips.name}
              InputProps={{
                endAdornment: (
                  <Tooltip title={tooltips.name}>
                    <HelpOutlineIcon sx={{ color: 'text.secondary' }} />
                  </Tooltip>
                )
              }}
          />
          <TextField
            label="Команда"
            value={editDialog.button.command}
              onChange={e => setEditDialog({ 
                ...editDialog, 
                button: { ...editDialog.button, command: e.target.value } 
              })}
            fullWidth
              required
              error={!editDialog.button.command.trim()}
              helperText={!editDialog.button.command.trim() ? 'Обязательное поле' : tooltips.command}
              InputProps={{
                endAdornment: (
                  <Tooltip title={tooltips.command}>
                    <HelpOutlineIcon sx={{ color: 'text.secondary' }} />
                  </Tooltip>
                )
              }}
          />
          <TextField
            label="Тег"
            value={editDialog.button.tag}
              onChange={e => setEditDialog({ 
                ...editDialog, 
                button: { ...editDialog.button, tag: e.target.value } 
              })}
            fullWidth
              helperText={tooltips.tag}
              InputProps={{
                endAdornment: (
                  <Tooltip title={tooltips.tag}>
                    <HelpOutlineIcon sx={{ color: 'text.secondary' }} />
                  </Tooltip>
                )
              }}
          />
          <FormGroup row sx={{ mt: 1 }}>
            <FormControlLabel
                control={
                  <Checkbox 
                    checked={editDialog.button.showOnMain !== false} 
                    onChange={e => setEditDialog({ 
                      ...editDialog, 
                      button: { ...editDialog.button, showOnMain: e.target.checked } 
                    })}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Показывать на главной
                    <Tooltip title={tooltips.showOnMain}>
                      <HelpOutlineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </Tooltip>
                  </Box>
                }
            />
            <FormControlLabel
                control={
                  <Checkbox 
                    checked={editDialog.button.showInEditor !== false} 
                    onChange={e => setEditDialog({ 
                      ...editDialog, 
                      button: { ...editDialog.button, showInEditor: e.target.checked } 
                    })}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Показывать в редакторе
                    <Tooltip title={tooltips.showInEditor}>
                      <HelpOutlineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </Tooltip>
                  </Box>
                }
            />
          </FormGroup>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setEditDialog({ open: false, index: null, button: defaultButton })}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button 
            onClick={() => handleButtonSave(editDialog.button, editDialog.index)}
            variant="contained"
            disabled={saving || !editDialog.button.name.trim() || !editDialog.button.command.trim()}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => !saving && setDeleteDialog({ open: false, index: null })}
      >
        <DialogTitle>Подтверждение удаления</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить кнопку "{config?.robotButtons?.[deleteDialog.index]?.name}"?
            Это действие нельзя отменить.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeleteDialog({ open: false, index: null })}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button 
            onClick={() => handleButtonDelete(deleteDialog.index)}
            color="error"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            {saving ? 'Удаление...' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог настроек */}
      <Dialog
        open={settingsOpen}
        onClose={() => !saving && setSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Настройки системы</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Имя робота"
              value={robotName}
              onChange={e => setRobotName(e.target.value)}
              fullWidth
              helperText="Имя робота, отображаемое в интерфейсе"
            />
            <TextField
              label="Корневой путь (rootPath)"
              value={rootPath}
              onChange={e => setRootPath(e.target.value)}
              fullWidth
              helperText="Путь к корневой директории проекта на роботе"
            />
            <TextField
              label="Путь к SDK (sdkPath)"
              value={sdkPath}
              onChange={e => setSdkPath(e.target.value)}
              fullWidth
              helperText="Путь к директории unitree_sdk2 на роботе"
            />
            <Divider />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Системные кнопки
            </Typography>
            {config?.robotButtons?.filter(btn => isSystemButton(btn)).map((btn, idx) => (
              <Box key={btn.id} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  {btn.tag === 'build' ? 'Кнопка сборки' : 'Кнопка сброса'}
                </Typography>
                <TextField
                  label="Название кнопки"
                  value={btn.name}
                  onChange={e => {
                    const newButtons = [...config.robotButtons];
                    const buttonIndex = newButtons.findIndex(b => b.id === btn.id);
                    if (buttonIndex !== -1) {
                      newButtons[buttonIndex] = { ...btn, name: e.target.value };
                      setConfig({ ...config, robotButtons: newButtons });
                    }
                  }}
                  fullWidth
                  margin="normal"
                />
                <TextField
                  label="Команда"
                  value={btn.command}
                  onChange={e => {
                    const newButtons = [...config.robotButtons];
                    const buttonIndex = newButtons.findIndex(b => b.id === btn.id);
                    if (buttonIndex !== -1) {
                      newButtons[buttonIndex] = { ...btn, command: e.target.value };
                      setConfig({ ...config, robotButtons: newButtons });
                    }
                  }}
                  fullWidth
                  margin="normal"
                  helperText="Используйте {sdkPath} для подстановки пути к SDK"
                />
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setSettingsOpen(false);
              fetchConfig(); // Восстанавливаем исходные значения
            }}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button 
            onClick={async () => {
              setSaving(true);
              try {
                // Заменяем {sdkPath} в командах на реальный путь
                const newButtons = config.robotButtons.map(btn => ({
                  ...btn,
                  command: btn.command.replace(/{sdkPath}/g, sdkPath)
                }));

                const res = await fetch(`${API_BASE_URL}/config`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    ...config, 
                    RobotName: robotName,
                    rootPath,
                    sdkPath,
                    robotButtons: newButtons
                  }),
                });
                if (!res.ok) throw new Error();
                setSuccess(true);
                setError(null);
                setSettingsOpen(false);
                fetchConfig(); // Обновляем конфигурацию
              } catch (e) {
                setError('Ошибка сохранения настроек');
              } finally {
                setSaving(false);
              }
            }}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Уведомления */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={success}
        autoHideDuration={4000}
        onClose={() => setSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccess(false)} severity="success" sx={{ width: '100%' }}>
          Изменения успешно сохранены
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ConfigPage; 