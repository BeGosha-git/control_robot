import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, TextField, IconButton, Paper, List, ListItem, ListItemText, ListItemSecondaryAction, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import axios from 'axios';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';

const API_URL = 'http://localhost:3001/api/config';

const DEFAULT_CONFIG = [
  {
    id: 1,
    tag: 'build',
    name: 'Забилдить',
    command: 'cd /home/unitree/unitree_sdk2&&cd build&&cmake ..&&make'
  },
  {
    id: 2,
    tag: 'reset',
    name: 'Сброс',
    command: '/home/unitree/unitree_sdk2/build/bin/H1_RESET_POSITION eth0'
  }
];

export default function ConfigPage() {
  const [buttons, setButtons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editDialog, setEditDialog] = useState({ open: false, index: null, name: '', command: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsData, setSettingsData] = useState([]);
  const [rootPath, setRootPath] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    updateResetButtonId();
  }, [buttons]);

  function updateResetButtonId() {
    const resetIndex = buttons.findIndex(btn => (btn.tag === 'reset'));
    if (resetIndex === - 1) return;
    const otherButtons = buttons.filter((_, i) => i !== resetIndex);
    const maxOtherId = otherButtons.length ? Math.max(...otherButtons.map(btn => btn.id)) : 0;
    const newResetId = maxOtherId + 1;
    if (buttons[resetIndex].id !== newResetId) {
      const newButtons = [...buttons];
      newButtons[resetIndex] = { ...newButtons[resetIndex], id: newResetId };
      setButtons(newButtons);
    }
  }

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_URL);
      setButtons(res.data.robotButtons || []);
      setRootPath(res.data.rootPath || '');
      setError(null);
    } catch (e) {
      setError('Ошибка загрузки конфига');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (newButtons, newRootPath = rootPath) => {
    setLoading(true);
    try {
      await axios.post(API_URL, { robotButtons: newButtons, rootPath: newRootPath });
      setButtons(newButtons);
      setRootPath(newRootPath);
      setError(null);
    } catch (e) {
      setError('Ошибка сохранения конфига');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (index) => {
    const btn = buttons[index];
    if (btn.tag === 'build') { return; }
    setEditDialog({ open: true, index, name: btn.name, command: btn.command });
  };

  const handleEditSave = () => {
    const newButtons = [...buttons];
    if (newButtons[editDialog.index].tag === 'build') { return; }
    newButtons[editDialog.index] = { ...newButtons[editDialog.index], name: editDialog.name, command: editDialog.command };
    saveConfig(newButtons);
    updateResetButtonId();
    setEditDialog({ open: false, index: null, name: '', command: '' });
  };

  const handleDelete = (index) => {
    if (buttons[index].tag === 'build' || buttons[index].tag === 'reset') { return; }
    const newButtons = buttons.filter((_, i) => i !== index);
    saveConfig(newButtons);
  };

  const handleAdd = () => {
    const maxId = buttons.length ? Math.max(...buttons.map(btn => btn.id)) : 0;
    const newId = maxId + 1;
    const newButton = { id: newId, tag: 'custom', name: 'Новая кнопка', command: '' };
    const resetIndex = buttons.findIndex(btn => (btn.tag === 'reset'));
    let newButtons;
    if (resetIndex === - 1) {
      newButtons = [...buttons, newButton];
    } else {
      newButtons = [...buttons.slice(0, resetIndex), newButton, ...buttons.slice(resetIndex)];
    }
    saveConfig(newButtons);
    updateResetButtonId();
  };

  const handleReset = async () => {
    await saveConfig(DEFAULT_CONFIG, DEFAULT_CONFIG.rootPath);
  };

  const handleSettingsOpen = () => {
    setSettingsData(buttons.filter(btn => btn.tag !== 'custom').map(btn => ({ ...btn })));
    setSettingsOpen(true);
    setRootPath(rootPath || '');
  };
  const handleSettingsClose = () => { setSettingsOpen(false); };

  const handleSettingsChange = (idx, field, value) => {
    setSettingsData(prev => prev.map((btn, i) => i === idx ? { ...btn, [field]: value } : btn));
  };

  const handleSettingsSave = () => {
    const newButtons = buttons.map(btn => {
      const idx = settingsData.findIndex(sbtn => sbtn.id === btn.id);
      if (idx !== -1) {
        return { ...btn, name: settingsData[idx].name, command: settingsData[idx].command };
      }
      return btn;
    });
    saveConfig(newButtons, rootPath);
    setSettingsOpen(false);
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Настройка кнопок управления роботом</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Настроить системные кнопки">
            <IconButton onClick={handleSettingsOpen} color="primary" aria-label="Настройки" size="large" sx={{ fontSize: 32 }}>
              <SettingsIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            Системные кнопки
          </Typography>
        </Box>
      </Box>
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
      <Paper sx={{ p: 2, mb: 2 }}>
        <List>
          {buttons.map((btn, idx) => (
            <ListItem key={btn.id} divider>
              <ListItemText
                primary={btn.name}
                secondary={btn.command}
                onClick={() => handleEdit(idx)}
                sx={{ cursor: (btn.tag === 'build') ? 'default' : 'pointer' }}
              />
              {btn.tag !== 'build' && btn.tag !== 'reset' && (
                <ListItemSecondaryAction>
                  <IconButton edge="end" color="error" onClick={() => handleDelete(idx)}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              )}
            </ListItem>
          ))}
        </List>
        <Button startIcon={<AddIcon />} onClick={handleAdd} variant="contained" sx={{ mt: 2, mr: 2 }}>Добавить кнопку</Button>
        <Button startIcon={<SaveIcon />} onClick={handleReset} variant="outlined" color="warning" sx={{ mt: 2 }}>Сбросить к дефолту</Button>
      </Paper>
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, index: null, name: '', command: '' })}>
        <DialogTitle>Редактировать кнопку</DialogTitle>
        <DialogContent>
          <TextField
            label="Название"
            fullWidth
            margin="normal"
            value={editDialog.name}
            onChange={e => setEditDialog({ ...editDialog, name: e.target.value })}
          />
          <TextField
            label="Команда"
            fullWidth
            margin="normal"
            value={editDialog.command}
            onChange={e => setEditDialog({ ...editDialog, command: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, index: null, name: '', command: '' })}>Отмена</Button>
          <Button startIcon={<SaveIcon />} onClick={handleEditSave} variant="contained">Сохранить</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={settingsOpen} onClose={handleSettingsClose} id="settings-dialog">
        <DialogTitle>Настройки названий и команд системных кнопок</DialogTitle>
        <DialogContent>
          <TextField
            label="Корневой путь (rootPath)"
            fullWidth
            margin="normal"
            value={rootPath}
            onChange={e => setRootPath(e.target.value)}
            sx={{ mb: 3 }}
            placeholder={rootPath ? undefined : 'Загрузка...'}
            InputProps={{ readOnly: loading }}
          />
          {settingsData.map((btn, idx) => (
            <Box key={btn.id} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                {btn.tag === 'build' ? 'Кнопка сборки' : btn.tag === 'reset' ? 'Кнопка сброса' : 'Системная кнопка'}
              </Typography>
              <TextField
                label="Название кнопки"
                fullWidth
                margin="normal"
                value={btn.name}
                onChange={e => handleSettingsChange(idx, 'name', e.target.value)}
              />
              <TextField
                label="Команда"
                fullWidth
                margin="normal"
                value={btn.command}
                onChange={e => handleSettingsChange(idx, 'command', e.target.value)}
              />
              {idx < settingsData.length - 1 && <Divider sx={{ my: 2 }} />}
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSettingsClose}>Отмена</Button>
          <Button startIcon={<SaveIcon />} onClick={handleSettingsSave} variant="contained">Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 