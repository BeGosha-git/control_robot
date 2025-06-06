import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Box, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  Typography, 
  TextField, 
  IconButton, 
  InputAdornment, 
  Paper,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  styled
} from '@mui/material';
import {
  FolderIcon,
  InsertDriveFileIcon,
  SearchIcon,
  CreateNewFolderIcon,
  NoteAddIcon,
  DeleteIcon,
  SaveAsIcon,
  EditIcon,
  ArrowUpwardIcon,
  UploadFileIcon,
  CloudUploadIcon,
  DownloadIcon,
  DescriptionIcon,
  ImageIcon,
  CodeIcon,
  PictureAsPdfIcon,
  MovieIcon,
  AudiotrackIcon,
  ArchiveIcon,
  TextSnippetIcon
} from '../utils/mui-imports';
import axios from 'axios';
import { filesize } from 'filesize';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = '/api/fs';

// Стили
const treeFont = {
  fontFamily: `'Fira Sans', Arial, sans-serif`,
  fontSize: '1rem',
  color: '#e0e0e0',
  letterSpacing: 0.2,
};

const FileListItem = styled(ListItem, {
  shouldForwardProp: prop => !['noDecor', 'level', 'selected', 'type', 'isLastFile'].includes(prop)
})(
  ({ theme, level, selected, type, isLastFile, noDecor }) => ({
    position: 'relative',
    marginLeft: 0,
    borderRadius: 0,
    marginBottom: 0,
    background: selected ? 'rgba(144, 202, 249, 0.12)' : 'transparent',
    color: '#e0e0e0',
    border: 'none',
    boxShadow: 'none',
    fontWeight: selected ? 600 : 400,
    fontSize: '0.95rem',
    paddingLeft: level ? 28 + (level * 24) : 28,
    paddingRight: 16,
    minHeight: 48,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease',
    '&:last-child': {
      borderBottom: 'none'
    },
    '& .MuiListItemIcon-root': {
      minWidth: 40,
      marginRight: 16,
      display: 'flex',
      alignItems: 'center',
      height: 40,
    },
    '& .MuiListItemText-root': {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: 0,
      marginTop: 2,
      marginBottom: 2,
    },
    '& .MuiListItemText-primary': {
      fontWeight: selected ? 600 : 400,
      color: selected ? '#ffffff' : '#e0e0e0',
      fontSize: '0.95rem',
      lineHeight: 1.4,
      marginBottom: 2,
    },
    '& .MuiListItemText-secondary': {
      fontSize: '0.8rem',
      color: selected ? '#ffffff' : '#b0b0b0',
      opacity: selected ? 0.9 : 0.7,
      lineHeight: 1.2,
    },
    '&:hover': {
      background: 'rgba(255, 255, 255, 0.05)',
      color: '#ffffff',
    },
    ...(noDecor ? {
      '&::before': {},
      '&::after': {},
    } : {}),
  })
);

const FileListItemWithConnector = styled(FileListItem, {
  shouldForwardProp: prop => !['noDecor', 'level', 'selected', 'type', 'isLastFile'].includes(prop)
})(({ theme, level, selected, type, isLastFile, noDecor }) => ({
  userSelect: 'none',
  WebkitUserDrag: 'none',
  '& *': {
    userSelect: 'none',
    WebkitUserDrag: 'none'
  },
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  '&.dragging': {
    opacity: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    transform: 'scale(0.95)',
    transition: 'transform 0.2s ease, opacity 0.2s ease',
  },
  '&.drag-over': {
    backgroundColor: 'rgba(144, 202, 249, 0.1)',
    border: '2px dashed rgba(144, 202, 249, 0.5)',
  }
}));

const FileListItemIcon = styled(ListItemIcon)(({ type }) => ({
  minWidth: 32,
  color: type === 'directory' ? '#b0b0b0' : '#e0e0e0',
  fontSize: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const FileExplorer = ({ 
  files, 
  onFileSelect, 
  onDirectorySelect, 
  currentPath, 
  rootPath, 
  onRename, 
  selectedFile, 
  fetchFileTree,
  drawerWidth = '20vw',
  onAfterDelete,
  expandedPaths = [],
  setExpandedPaths = () => {},
  onResize
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [createDialog, setCreateDialog] = useState({ open: false, type: null });
  const [newName, setNewName] = useState('');
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverItem, setDragOverItem] = useState(null);
  const [folderStats, setFolderStats] = useState({});
  const navigateUpTimeout = useRef(null);
  const folderEnterTimeout = useRef(null);
  const [saveAsDialog, setSaveAsDialog] = useState({ open: false, item: null, newName: '', dir: '' });
  const [deletedFileCache, setDeletedFileCache] = useState(null);
  const [confirmLargeCopy, setConfirmLargeCopy] = useState({ open: false, folder: null, newName: '', size: 0 });
  const [confirmDelete, setConfirmDelete] = useState({ open: false, item: null, size: 0 });
  const [irreversibleAction, setIrreversibleAction] = useState(false);
  const [renameDialog, setRenameDialog] = useState({ open: false, item: null, newName: '' });
  const [dragState, setDragState] = useState({
    isDragging: false,
    startX: 0,
    startY: 0,
    currentItem: null
  });
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, item: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null });
  const [renameError, setRenameError] = useState(null);
  const [saveAsError, setSaveAsError] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverPath, setDragOverPath] = useState(null);
  const [dragOverGlobal, setDragOverGlobal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const listRef = useRef(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [anchorIndex, setAnchorIndex] = useState(null);

  const isRoot = !currentPath;

  // Получаем режим отображения столбцов
  const showDate = drawerWidth > 300;
  const showType = drawerWidth > 250;

  // Ссылка на dragImage для удаления после dragEnd
  let currentDragImage = null;

  function getDragEmoji(item) {
    if (item.type === 'directory') return '📁';
    const ext = (item.ext || (item.name && item.name.split('.').pop() || '')).toLowerCase();
    if (["png","jpg","jpeg","gif","bmp","webp"].includes(ext)) return '🖼️';
    if (["mp3","wav","ogg","flac"].includes(ext)) return '🎵';
    if (["mp4","avi","mov","mkv","webm"].includes(ext)) return '🎬';
    if (["pdf"].includes(ext)) return '📄';
    if (["zip","rar","7z","tar","gz"].includes(ext)) return '🗜️';
    return '📄';
  }

  // --- Модальное окно создания файла/папки ---
  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await axios.post(`${API_BASE_URL}/create`, {
        path: (currentPath ? currentPath + '/' : '') + newName,
        type: createDialog.type
      });
      setCreateDialog({ open: false, type: null });
      setNewName('');
      fetchFileTree(currentPath);
    } catch (e) {
      setError('Ошибка создания');
    }
  };

  // --- Поиск ---
  const filteredItems = useMemo(() => {
    if (!files?.items) return [];
    if (!searchQuery.trim()) return files.items;
    const q = searchQuery.trim().toLowerCase();
    return files.items.filter(item => item.name.toLowerCase().includes(q));
  }, [files, searchQuery]);

  // --- ПКМ-меню ---
  const handleContextMenu = (event, item) => {
    event.preventDefault();
    setContextMenu({ 
      open: true, 
      x: event.clientX, 
      y: event.clientY, 
      item,
      isMultiSelect: selectedItems.length > 1
    });
  };
  // Глобально запрещаем меню браузера на дереве
  const handleListContextMenu = (e) => e.preventDefault();
  const handleCloseContextMenu = () => setContextMenu({ open: false, x: 0, y: 0, item: null });
  const handleRename = () => {
    if (contextMenu.item) {
      setRenameDialog({ 
        open: true, 
        item: contextMenu.item, 
        newName: contextMenu.item.name 
      });
      setRenameError(null);
    }
    handleCloseContextMenu();
  };
  const handleSaveAs = () => {
    if (contextMenu.item) {
      setSaveAsDialog({ 
        open: true, 
        item: contextMenu.item, 
        newName: contextMenu.item.name,
        dir: currentPath || ''
      });
      setSaveAsError(null);
    }
    handleCloseContextMenu();
  };
  const handleDelete = () => {
    if (contextMenu.item) {
      setDeleteDialog({ 
        open: true, 
        item: contextMenu.item 
      });
    }
    handleCloseContextMenu();
  };

  // --- Drag & Drop ---
  const handleDragStart = (e, item) => {
    e.currentTarget.classList.add('dragging');

    // Если файл не выделен — выделить только его
    if (!selectedItems.includes(item.path)) {
      setSelectedItems([item.path]);
    }

    // Если выделено несколько — показываем количество
    let dragLabel = item.name;
    let emoji = getDragEmoji(item);
    if (selectedItems.length > 1 && selectedItems.includes(item.path)) {
      dragLabel = `${selectedItems.length} файлов`;
      emoji = '📦';
    }

    // Создаем кастомный dragImage
    const dragImage = document.createElement('div');
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.left = '-1000px';
    dragImage.style.zIndex = '9999';
    dragImage.style.pointerEvents = 'none';
    dragImage.style.background = 'rgba(33,150,243,0.95)';
    dragImage.style.color = '#fff';
    dragImage.style.fontWeight = 'bold';
    dragImage.style.fontSize = '1rem';
    dragImage.style.padding = '8px 24px 8px 16px';
    dragImage.style.borderRadius = '6px';
    dragImage.style.display = 'flex';
    dragImage.style.alignItems = 'center';
    dragImage.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)';

    // Добавляем иконку
    const icon = document.createElement('span');
    icon.innerHTML = emoji;
    icon.style.fontSize = '1.3em';
    icon.style.marginRight = '10px';
    dragImage.appendChild(icon);

    // Добавляем текст
    const text = document.createElement('span');
    text.textContent = dragLabel;
    dragImage.appendChild(text);

    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 20, 20);

    // Сохраняем ссылку для удаления после dragEnd
    currentDragImage = dragImage;

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.path);
    // Сохраняем draggedItem для handleDrop
    setDraggedItem(item);
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    if (currentDragImage) {
      document.body.removeChild(currentDragImage);
      currentDragImage = null;
    }
  };

  const handleDragOver = (e, item) => {
    e.preventDefault();
    setDragOverPath(item.path);
  };
  const handleDragLeave = (e, item) => {
    setDragOverPath(null);
  };
  const handleDrop = async (e, targetItem) => {
    e.preventDefault();
    setDragOverPath(null);
    let itemsToMove = [];
    
    if (selectedItems.length > 1 && draggedItem && selectedItems.includes(draggedItem.path)) {
      // Перемещаем все выделенные
      itemsToMove = selectedItems.map(path => files.items.find(i => i.path === path)).filter(Boolean);
    } else if (draggedItem) {
      // Перемещаем только один
      itemsToMove = [draggedItem];
    }
    
    if (!itemsToMove.length || !targetItem) return;

    try {
      const sources = itemsToMove.map(item => {
    let destination;
    if (targetItem.type === 'directory') {
          destination = targetItem.path + '/' + item.name;
    } else {
          destination = targetItem.path.split('/').slice(0, -1).join('/') + '/' + item.name;
        }
        return { source: item.path, destination };
      });

      const response = await axios.post(`${API_BASE_URL}/move`, {
        sources: sources.map(source => ({
          source: source.source,
          destination: source.destination
        }))
      });
      
      if (response.status === 207) {
        // Частичное перемещение
        const { results, errors } = response.data;
        if (errors.length > 0) {
          setError(`Ошибка при перемещении ${errors.length} из ${sources.length} файлов`);
        }
      }
      
      setDraggedItem(null);
      fetchFileTree(currentPath);
    } catch (error) {
      console.error('Ошибка при перемещении файлов:', error);
      setError(error.response?.data?.error || 'Ошибка при перемещении файлов');
    }
  };

  const handleDropToUp = async (e) => {
    e.preventDefault();
    setDragOverPath(null);
    
    if (!draggedItem || !currentPath) return;
    
    let itemsToMove = [];
    if (selectedItems.length > 1 && selectedItems.includes(draggedItem.path)) {
      // Перемещаем все выделенные
      itemsToMove = selectedItems.map(path => files.items.find(i => i.path === path)).filter(Boolean);
    } else {
      // Перемещаем только один
      itemsToMove = [draggedItem];
    }

    if (!itemsToMove.length) return;

    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = parts.join('/');

    try {
      const sources = itemsToMove.map(item => ({
        source: item.path,
        destination: (upPath ? upPath + '/' : '') + item.name
      }));

      const response = await axios.post(`${API_BASE_URL}/move`, {
        sources: sources.map(source => ({
          source: source.source,
          destination: source.destination
        }))
      });
      
      if (response.status === 207) {
        // Частичное перемещение
        const { results, errors } = response.data;
        if (errors.length > 0) {
          setError(`Ошибка при перемещении ${errors.length} из ${sources.length} файлов`);
        }
      }
      
      setDraggedItem(null);
      fetchFileTree(currentPath);
    } catch (error) {
      console.error('Ошибка при перемещении файлов:', error);
      setError(error.response?.data?.error || 'Ошибка при перемещении файлов');
    }
  };

  // Функция для переключения раскрытия папки
  const handleToggleFolder = useCallback((path) => {
    setExpandedPaths(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
    onDirectorySelect(path);
  }, [onDirectorySelect]);

  // --- renderFileTree ---
  const renderFileTree = useCallback((items) => {
    if (!items) return null;
    const folders = items.filter(item => item.type === 'directory');
    const files = items.filter(item => item.type !== 'directory');
    
    return (
      <>
        {folders.map((item, idx) => (
          <React.Fragment key={item.path}>
            <FileListItem
              className="file-list-item"
              data-path={item.path}
              button
              selected={selectedItems.includes(item.path)}
              onClick={(e) => handleItemClick(e, item)}
              onDoubleClick={e => {
                if (item.type === 'directory') {
                  handleToggleFolder(item.path);
                }
              }}
              draggable
              onDragStart={e => handleDragStart(e, item)}
              onDragEnd={handleDragEnd}
              onDragOver={e => handleDragOver(e, item)}
              onDragLeave={e => handleDragLeave(e, item)}
              onDrop={e => handleDrop(e, item)}
              level={item.path.split('/').length - 1}
              type={item.type}
              sx={{ 
                background: selectedItems.includes(item.path) 
                  ? 'rgba(144, 202, 249, 0.12)'
                  : 'transparent',
                color: selectedItems.includes(item.path) ? '#fff' : '#e0e0e0',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                },
                display: 'flex',
                alignItems: 'center',
                px: 2,
                my: 0.5
              }}
              onContextMenu={e => handleContextMenu(e, item)}
            >
              {/* Столбец 1: иконка, имя, размер */}
              <Box sx={{ flex: 3, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <ListItemIcon>
                  {getFolderColor(item.name, item.type)}
                </ListItemIcon>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 700, color: 'inherit', fontSize: '1rem', maxWidth: 260, minWidth: 80 }}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#b0b0b0', opacity: 0.7, fontSize: '0.85rem', lineHeight: 1, mt: 0.5 }}>
                    {item.childrenCount !== undefined ? `${item.childrenCount} файлов` : ''}
                  </Typography>
                </Box>
              </Box>
            </FileListItem>
            {/* Если папка раскрыта — рендерим её содержимое (рекурсивно) */}
            {expandedPaths.includes(item.path) && item.children && item.children.length > 0 && (
              <Box sx={{ 
                pl: 4,
                borderLeft: '1px solid rgba(255, 255, 255, 0.04)',
                ml: 2
              }}>
                {renderFileTree(item.children)}
              </Box>
            )}
          </React.Fragment>
        ))}
        {folders.length > 0 && files.length > 0 && (
          <Box sx={{ height: 8 }} />
        )}
        {files.map((item, idx) => {
          const isSelected = selectedItems.includes(item.path);
          const ext = item.ext || (item.name && item.name.includes('.') ? item.name.split('.').pop() : '');
          const maxChars = Math.floor((drawerWidth - 100) / 10);
          const displayName = item.name.length > maxChars ? (item.name.slice(0, maxChars) + '…') : item.name;
          const showInfo = drawerWidth >= 250;
          return (
            <React.Fragment key={item.path}>
              <FileListItem
                className="file-list-item"
                data-path={item.path}
                button
                selected={isSelected}
                onClick={(e) => handleItemClick(e, item)}
                onDoubleClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onFileSelect(item.path);
                }}
                draggable
                onDragStart={e => handleDragStart(e, item)}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleDragOver(e, item)}
                onDragLeave={e => handleDragLeave(e, item)}
                onDrop={e => handleDrop(e, item)}
                level={item.path.split('/').length - 1}
                type={item.type}
                isLastFile={idx === files.length - 1}
                sx={{ 
                  background: selectedItems.includes(item.path) 
                    ? 'rgba(144, 202, 249, 0.12)'
                    : 'transparent',
                  color: selectedItems.includes(item.path) ? '#fff' : '#e0e0e0',
                  '&:hover': {
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#fff',
                  },
                  display: 'flex',
                  alignItems: 'center',
                  px: 2,
                  my: 0.5
                }}
                onContextMenu={e => handleContextMenu(e, item)}
              >
                {/* Столбец 1: иконка, имя, размер */}
                <Box sx={{ flex: 3, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <ListItemIcon>
                    {item.type === 'directory' ? (
                      <FolderIcon sx={{ fontSize: 32, color: '#e0e0e0', opacity: 0.9 }} />
                    ) : (
                      getFileIcon(ext)
                    )}
                  </ListItemIcon>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography noWrap sx={{ fontWeight: 700, color: 'inherit', fontSize: '1.08rem', maxWidth: '100%', minWidth: 60 }}>
                      {showInfo ? displayName : (item.name.includes('.') ? item.name.substring(0, item.name.lastIndexOf('.')) : item.name)}
                          </Typography>
                    {showInfo && (
                            <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', mt: 0.2, fontSize: '0.85rem', color: '#b0b0b0', opacity: 0.8 }}>
                              <Typography variant="caption" sx={{ fontSize: '0.85rem', color: '#b0b0b0', opacity: 0.8 }}>
                                {formatDate(item.modified || item.mtime || item.mtimeMs || item.modifiedAt)}
                              </Typography>
                              {item.size !== undefined && item.type !== 'directory' && (
                                <Typography variant="caption" sx={{ fontSize: '0.85rem', color: '#b0b0b0', opacity: 0.8 }}>
                                  ({filesize(item.size)})
                                </Typography>
                              )}
                            </Box>
                    )}
                    {!showInfo && (
                            <Typography variant="caption" sx={{ fontSize: '0.85rem', color: '#b0b0b0', opacity: 0.8, mt: 0.2 }}>
                        {item.type !== 'directory' ? (item.ext || (item.name && item.name.includes('.') ? item.name.split('.').pop() : '')) : ''}
                            </Typography>
                          )}
                  </Box>
                </Box>
              </FileListItem>
            </React.Fragment>
          );
        })}
      </>
    );
  }, [selectedItems, handleToggleFolder, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop, handleContextMenu, onFileSelect, files]);

  // Обработчики диалогов
  const handleRenameConfirm = async () => {
    if (!renameDialog.item || !renameDialog.newName.trim()) return;
    
    const oldPath = renameDialog.item.path;
    const newName = renameDialog.newName.trim();
    
    // Проверки на стороне клиента
    if (!newName || newName === renameDialog.item.name) {
      setRenameError('Новое имя не должно совпадать с текущим и быть пустым');
      return;
    }
    
    // Проверка на недопустимые символы
    if (/[/\\:*?"<>|]/.test(newName)) {
      setRenameError('Имя содержит недопустимые символы (/ \\ : * ? " < > |)');
      return;
    }
    
    // Проверка на скрытые файлы
    if (newName.startsWith('.')) {
      setRenameError('Скрытые файлы и папки запрещены');
      return;
    }
    
    // Формируем новый путь, сохраняя директорию
    const dirPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
    const newPath = dirPath + newName;
    
    try {
      await axios.post(`${API_BASE_URL}/rename`, {
        oldPath,
        newPath // Отправляем полный новый путь вместо только имени
      });
      
      setRenameDialog({ open: false, item: null, newName: '' });
      setRenameError(null);
      fetchFileTree(currentPath);
    } catch (e) {
      const error = e.response?.data;
      if (error?.error === 'Целевой элемент уже существует') {
        setRenameError('Файл или папка с таким именем уже существует');
      } else if (error?.error === 'Доступ запрещен') {
        setRenameError('Нет прав для переименования');
      } else {
        setRenameError(error?.error || 'Ошибка переименования');
      }
    }
  };

  const handleSaveAsConfirm = async () => {
    if (!saveAsDialog.item || !saveAsDialog.newName.trim()) return;
    try {
      let dir = saveAsDialog.dir.trim();
      if (dir && !dir.endsWith('/')) dir += '/';
      const newPath = dir + saveAsDialog.newName.trim();
      await axios.post(`${API_BASE_URL}/copy`, {
        source: saveAsDialog.item.path,
        destination: newPath
      });
      setSaveAsDialog({ open: false, item: null, newName: '', dir: '' });
      setSaveAsError(null);
      fetchFileTree(currentPath);
    } catch (e) {
      setSaveAsError(e.response?.data?.error || 'Ошибка сохранения');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.item) return;
    try {
      await axios.delete(`${API_BASE_URL}/delete`, {
        data: { path: deleteDialog.item.path }
      });
      setDeleteDialog({ open: false, item: null });
      fetchFileTree(currentPath);
      if (onAfterDelete) {
        onAfterDelete(deleteDialog.item.path, deleteDialog.item.type === 'directory');
      }
    } catch (e) {
      setError('Ошибка удаления');
    }
  };

  // 1. Автоматическое скрытие ошибки
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('targetPath', currentPath || '');
    try {
      await axios.post('http://localhost:3001/api/fs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      fetchFileTree(currentPath);
    } catch (e) {
      setError('Ошибка загрузки файлов');
    }
  };

  // Глобальные drag&drop обработчики
  useEffect(() => {
    const handleDragOver = (e) => {
      // Показываем drop-зону только если drag из внешнего источника (нет text/plain, есть Files)
      const dt = e.dataTransfer;
      if (dt && dt.types && dt.types.includes('Files') && !dt.types.includes('text/plain')) {
        e.preventDefault();
        setDragOverGlobal(true);
      }
    };
    const handleDragLeave = (e) => {
      // Скрываем drop-зону только если dragleave из внешнего источника
      const dt = e.dataTransfer;
      if (dt && dt.types && dt.types.includes('Files') && !dt.types.includes('text/plain')) {
        e.preventDefault();
        setDragOverGlobal(false);
      }
    };
    const handleDrop = (e) => {
      // Обрабатываем drop только если из внешнего источника
      const dt = e.dataTransfer;
      if (dt && dt.types && dt.types.includes('Files') && !dt.types.includes('text/plain')) {
        e.preventDefault();
        setDragOverGlobal(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUpload(e.dataTransfer.files);
        }
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Функция для скачивания файла
  const handleDownload = (itemOrItems) => {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    if (!items.length) return;
    if (items.length === 1 && items[0].type !== 'directory') {
      // Один файл — обычная ссылка
      const url = `http://localhost:3001/api/fs/raw?path=${encodeURIComponent(items[0].path)}`;
      window.open(url, '_blank');
    } else {
      // Несколько файлов/папок — архив
      fetch('http://localhost:3001/api/fs/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: items.map(i => i.path) })
      })
        .then(res => res.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'archive.zip';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        });
    }
  };

  const handleItemClick = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Если это файл, открываем его
    if (item.type !== 'directory') {
      onFileSelect(item.path);
      return;
    }

    // Для папок обрабатываем выбор
    if (e.ctrlKey || e.metaKey) {
      setSelectedItems(prev => {
        if (prev.includes(item.path)) {
          return prev.filter(p => p !== item.path);
        }
        return [...prev, item.path];
      });
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      const currentIndex = files.items.findIndex(i => i.path === item.path);
      if (currentIndex !== -1) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        const newSelection = files.items
          .slice(start, end + 1)
          .map(i => i.path);
        setSelectedItems(newSelection);
      }
    } else {
      setSelectedItems([item.path]);
      setLastSelectedIndex(files.items.findIndex(i => i.path === item.path));
      setAnchorIndex(files.items.findIndex(i => i.path === item.path));
    }
  };

  // Добавляем обработчик клика по контейнеру
  const handleListClick = (e) => {
    // Проверяем, что клик был именно по контейнеру списка, а не по его элементам
    const clickedElement = e.target;
    const isClickOnListItem = clickedElement.closest('.file-list-item') !== null;
    
    // Если клик не по элементу списка и не по кнопкам/инпутам
    if (!isClickOnListItem && 
        !clickedElement.closest('button') && 
        !clickedElement.closest('input') && 
        !clickedElement.closest('.MuiIconButton-root')) {
      // Если не зажаты модификаторы, сбрасываем выделение
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        setSelectedItems([]);
      }
    }
  };

  // Обработка клавиш с улучшенным выделением
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }
      if (!files?.items?.length) return;
      const items = files.items;
      let currentIndex = lastSelectedIndex;
      const isShift = e.shiftKey;

      // Если нет выделения — начинаем с первого/последнего
      if (currentIndex === null || currentIndex === undefined || currentIndex < 0 || currentIndex >= items.length) {
        if (e.key === 'ArrowDown') {
          setSelectedItems([items[0].path]);
          setLastSelectedIndex(0);
          setAnchorIndex(0);
          const element = document.querySelector(`[data-path="${items[0].path}"]`);
          element?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          setSelectedItems([items[items.length - 1].path]);
          setLastSelectedIndex(items.length - 1);
          setAnchorIndex(items.length - 1);
          const element = document.querySelector(`[data-path="${items[items.length - 1].path}"]`);
          element?.scrollIntoView({ block: 'nearest' });
        }
        return;
      }

      switch (e.key) {
        case 'Enter': {
          e.preventDefault();
          const isCtrl = e.ctrlKey || e.metaKey;
          if (selectedItems.length > 1 && !isCtrl) {
            // Открыть все выделенные
            selectedItems.forEach(path => {
              const item = items.find(i => i.path === path);
              if (!item) return;
              if (item.type === 'directory') {
                onDirectorySelect(item.path);
              } else {
                onFileSelect(item.path);
              }
            });
          } else {
            // Только по активному
            const currentItem = items[lastSelectedIndex];
            if (currentItem) {
              if (currentItem.type === 'directory') {
                onDirectorySelect(currentItem.path);
              } else {
                onFileSelect(currentItem.path);
              }
            }
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (currentIndex > 0) {
            const newIndex = currentIndex - 1;
            if (isShift) {
              // Диапазон от anchorIndex
              const anchor = anchorIndex !== null ? anchorIndex : currentIndex;
              const range = [Math.min(anchor, newIndex), Math.max(anchor, newIndex)];
              const newSelection = items.slice(range[0], range[1] + 1).map(i => i.path);
              setSelectedItems(newSelection);
              setLastSelectedIndex(newIndex);
            } else {
              setSelectedItems([items[newIndex].path]);
              setLastSelectedIndex(newIndex);
              setAnchorIndex(newIndex);
            }
            const element = document.querySelector(`[data-path="${items[newIndex].path}"]`);
            element?.scrollIntoView({ block: 'nearest' });
          }
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          if (currentIndex < items.length - 1) {
            const newIndex = currentIndex + 1;
            if (isShift) {
              // Диапазон от anchorIndex
              const anchor = anchorIndex !== null ? anchorIndex : currentIndex;
              const range = [Math.min(anchor, newIndex), Math.max(anchor, newIndex)];
              const newSelection = items.slice(range[0], range[1] + 1).map(i => i.path);
              setSelectedItems(newSelection);
              setLastSelectedIndex(newIndex);
            } else {
              setSelectedItems([items[newIndex].path]);
              setLastSelectedIndex(newIndex);
              setAnchorIndex(newIndex);
            }
            const element = document.querySelector(`[data-path="${items[newIndex].path}"]`);
            element?.scrollIntoView({ block: 'nearest' });
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const currentItemLeft = items[currentIndex];
          if (currentItemLeft.type === 'directory' && expandedPaths.includes(currentItemLeft.path)) {
            handleToggleFolder(currentItemLeft.path);
          } else if (currentPath) {
            onDirectorySelect(currentPath.split('/').slice(0, -1).join('/'));
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const currentItemRight = items[currentIndex];
          if (currentItemRight.type === 'directory' && !expandedPaths.includes(currentItemRight.path)) {
            handleToggleFolder(currentItemRight.path);
          }
          break;
        }
      }
    }
  }, [files, selectedItems, lastSelectedIndex, anchorIndex, currentPath, expandedPaths, onFileSelect, onDirectorySelect]);

  // При изменении выделения обновляем lastSelectedIndex и anchorIndex
  useEffect(() => {
    if (!files?.items?.length) return;
    if (selectedItems.length === 1) {
      const idx = files.items.findIndex(i => i.path === selectedItems[0]);
      setLastSelectedIndex(idx);
      setAnchorIndex(idx);
    }
  }, [selectedItems, files]);

  // Вспомогательная функция для форматирования даты
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0,5);
  }

  // Функция для выбора иконки по расширению
  function getFileIcon(ext) {
    if (!ext) return <InsertDriveFileIcon sx={{ fontSize: 32, color: '#b0b0b0', opacity: 0.75 }} />;
    
    const iconStyles = {
      fontSize: 32,
      opacity: 0.75,
      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1))'
    };

    // Оставляем цвета только для файлов с кодом
    const codeFiles = {
      // Программирование
      js: <CodeIcon sx={{ ...iconStyles, color: '#f7df1e' }} />, // JavaScript желтый
      jsx: <CodeIcon sx={{ ...iconStyles, color: '#61dafb' }} />, // React голубой
      ts: <CodeIcon sx={{ ...iconStyles, color: '#3178c6' }} />, // TypeScript синий
      tsx: <CodeIcon sx={{ ...iconStyles, color: '#3178c6' }} />, // TypeScript React
      json: <CodeIcon sx={{ ...iconStyles, color: '#00bcd4' }} />, // JSON голубой
      html: <CodeIcon sx={{ ...iconStyles, color: '#e34c26' }} />, // HTML оранжевый
      css: <CodeIcon sx={{ ...iconStyles, color: '#264de4' }} />, // CSS синий
      scss: <CodeIcon sx={{ ...iconStyles, color: '#cc6699' }} />, // SCSS розовый
      py: <CodeIcon sx={{ ...iconStyles, color: '#ffd600' }} />, // Python желтый
      java: <CodeIcon sx={{ ...iconStyles, color: '#f89820' }} />, // Java оранжевый
      php: <CodeIcon sx={{ ...iconStyles, color: '#777bb4' }} />, // PHP фиолетовый
      rb: <CodeIcon sx={{ ...iconStyles, color: '#cc342d' }} />, // Ruby красный
      go: <CodeIcon sx={{ ...iconStyles, color: '#00add8' }} />, // Go голубой
      rs: <CodeIcon sx={{ ...iconStyles, color: '#dea584' }} />, // Rust оранжевый
      cpp: <CodeIcon sx={{ ...iconStyles, color: '#00599c' }} />, // C++ синий
      c: <CodeIcon sx={{ ...iconStyles, color: '#00599c' }} />, // C синий
      h: <CodeIcon sx={{ ...iconStyles, color: '#00599c' }} />, // Header синий
      cs: <CodeIcon sx={{ ...iconStyles, color: '#68217a' }} />, // C# фиолетовый
      swift: <CodeIcon sx={{ ...iconStyles, color: '#ff7f50' }} />, // Swift оранжевый
      kt: <CodeIcon sx={{ ...iconStyles, color: '#f18e33' }} />, // Kotlin оранжевый
      sh: <CodeIcon sx={{ ...iconStyles, color: '#4dba87' }} />, // Shell зеленый
      bat: <CodeIcon sx={{ ...iconStyles, color: '#4dba87' }} />, // Batch зеленый
      ps1: <CodeIcon sx={{ ...iconStyles, color: '#012456' }} />, // PowerShell синий
      md: <TextSnippetIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />, // Markdown серый
      txt: <TextSnippetIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />, // Текст серый
    };

    // Для остальных файлов используем нейтральные иконки
    const neutralIcons = {
      // Документы
      pdf: <PictureAsPdfIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      doc: <DescriptionIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      docx: <DescriptionIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      xls: <DescriptionIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      xlsx: <DescriptionIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      ppt: <DescriptionIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      pptx: <DescriptionIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,

      // Изображения
      png: <ImageIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      jpg: <ImageIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      jpeg: <ImageIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      gif: <ImageIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      webp: <ImageIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      svg: <ImageIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      ico: <ImageIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,

      // Аудио
      mp3: <AudiotrackIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      wav: <AudiotrackIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      ogg: <AudiotrackIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      flac: <AudiotrackIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,

      // Видео
      mp4: <MovieIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      mov: <MovieIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      avi: <MovieIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      mkv: <MovieIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      webm: <MovieIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,

      // Архивы
      zip: <ArchiveIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      rar: <ArchiveIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      '7z': <ArchiveIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      tar: <ArchiveIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
      gz: <ArchiveIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />,
    };

    return codeFiles[ext.toLowerCase()] || neutralIcons[ext.toLowerCase()] || 
      <InsertDriveFileIcon sx={{ ...iconStyles, color: '#b0b0b0' }} />;
  }

  // Добавим функцию для определения цвета папки
  function getFolderColor(name, type) {
    const iconStyles = {
      fontSize: 32,
      opacity: 0.75,
      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1))',
      color: '#b0b0b0' // Нейтральный цвет для всех папок
    };

    return <FolderIcon sx={iconStyles} />;
  }

  // Функция для импорта .cpp в редактор движений
  const handleImportToMotionEditor = async (item) => {
    if (!item || !item.path) return;
    try {
      // Просто переходим на motions с query, загрузка файла будет на той странице
      navigate(`/motion?import=${encodeURIComponent(item.path)}`);
    } catch (e) {
      setError('Ошибка загрузки файла для импорта');
    }
  };

  return (
    <Box 
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        userSelect: 'none', 
        '& input, & textarea': { userSelect: 'text' },
        outline: 'none',
        position: 'relative',
        width: drawerWidth,
        minWidth: 280,
        maxWidth: '40vw',
        bgcolor: 'rgba(26, 26, 26, 0.95)',
        backdropFilter: 'blur(10px)',
      }}
      tabIndex={0}
      onClick={handleListClick}
      onKeyDown={handleKeyDown}
    >
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2, 
          backgroundColor: 'transparent', 
          flexShrink: 0,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
          <Typography sx={{ 
            fontWeight: 600, 
            fontSize: '1.1rem', 
            color: '#e0e0e0',
            letterSpacing: 0.5
          }}>
            Файловый менеджер
          </Typography>
        </Box>
        <TextField
          fullWidth
          size="small"
          placeholder="Поиск файлов..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: '#e0e0e0', opacity: 0.7 }} />
              </InputAdornment>
            ),
          }}
          sx={{ 
            mb: 2,
            '& .MuiOutlinedInput-root': {
              bgcolor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 1,
              '& fieldset': { 
                borderColor: 'rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s ease'
              },
              '&:hover fieldset': { 
                borderColor: 'rgba(255, 255, 255, 0.2)',
                bgcolor: 'rgba(255, 255, 255, 0.08)'
              },
              '&.Mui-focused fieldset': { 
                borderColor: 'primary.main',
                bgcolor: 'rgba(144, 202, 249, 0.08)'
              },
            },
            '& .MuiInputBase-input': { 
              color: '#e0e0e0',
              fontSize: '0.9rem',
              py: 1
            },
            '& .MuiInputLabel-root': { 
              color: '#e0e0e0', 
              opacity: 0.7,
              fontSize: '0.9rem'
            },
          }}
        />
        <Typography 
          variant="caption" 
          sx={{ 
            mb: 1.5, 
            ml: 0.5, 
            color: '#e0e0e0', 
            opacity: 0.7,
            fontSize: '0.8rem',
            fontFamily: "'Fira Code', monospace"
          }}
        >
          {currentPath ? (rootPath ? currentPath : '/' + currentPath) : '/'}
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          mb: 2,
          flexWrap: 'wrap'
        }}>
          <Tooltip title="Создать файл">
            <IconButton 
              size="small" 
              onClick={() => setCreateDialog({ open: true, type: 'file' })}
              sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                '&:hover': { 
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <NoteAddIcon fontSize="small" sx={{ color: '#e0e0e0', opacity: 0.9 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Создать папку">
            <IconButton 
              size="small"
              onClick={() => setCreateDialog({ open: true, type: 'directory' })}
              sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                '&:hover': { 
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <CreateNewFolderIcon fontSize="small" sx={{ color: '#e0e0e0', opacity: 0.9 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Загрузить файлы">
            <IconButton 
              component="label" 
              size="small" 
              sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                '&:hover': { 
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <UploadFileIcon fontSize="small" sx={{ color: '#e0e0e0', opacity: 0.9 }} />
              <input
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={e => {
                  handleUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Загрузить папку">
            <IconButton 
              component="label" 
              size="small" 
              sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                '&:hover': { 
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <UploadFileIcon fontSize="small" sx={{ color: '#e0e0e0', opacity: 0.9 }} />
              <input
                type="file"
                multiple
                webkitdirectory="true"
                directory="true"
                style={{ display: 'none' }}
                onChange={e => {
                  handleUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Скачать выбранные">
            <span>
              <IconButton
                size="small"
                disabled={!selectedItems.length}
                onClick={() => {
                  const items = files?.items?.filter(f => selectedItems.includes(f.path));
                  if (items && items.length) handleDownload(items);
                }}
                sx={{ 
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  '&:hover': { 
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                  },
                  transition: 'all 0.2s ease',
                  '&.Mui-disabled': {
                    bgcolor: 'rgba(255, 255, 255, 0.02)',
                    opacity: 0.5
                  }
                }}
              >
                <DownloadIcon fontSize="small" sx={{ color: '#e0e0e0', opacity: 0.9 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        {error && (
          <Typography 
            color="error" 
            variant="caption" 
            sx={{ 
              display: 'block', 
              mb: 1, 
              color: '#e0e0e0', 
              opacity: 0.7,
              fontSize: '0.8rem'
            }}
          >
            {error}
          </Typography>
        )}
      </Paper>
      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />
      <Box sx={{ 
        bgcolor: 'transparent', 
        display: 'flex', 
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <List 
          ref={listRef}
          onContextMenu={handleListContextMenu} 
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleUpload(e.dataTransfer.files);
            }
          }}
          onDragOver={e => e.preventDefault()}
          sx={{ 
            overflow: 'auto',
            p: 0,
            m: 0,
            '& .MuiListItem-root': {
              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
              '&:last-child': {
                borderBottom: 'none'
              }
            },
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.2)',
              }
            }
          }}
        >
          {!isRoot && (
            <ListItem
              button
              onDoubleClick={() => onDirectorySelect(currentPath.split('/').slice(0, -1).join('/'))}
              sx={{ 
                fontStyle: 'italic', 
                color: '#e0e0e0',
                opacity: 0.7,
                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  opacity: 1
                },
                transition: 'all 0.2s ease'
              }}
              onDragOver={e => { if (currentPath) e.preventDefault(); }}
              onDrop={handleDropToUp}
            >
              <ListItemIcon>
                <FolderIcon sx={{ 
                  fontSize: 24, 
                  color: '#90caf9', 
                  opacity: 0.95, 
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' 
                }} />
              </ListItemIcon>
              <ListItemText primary=".." />
            </ListItem>
          )}
          {renderFileTree(filteredItems)}
        </List>
      </Box>

      {/* Модальное окно создания файла/папки */}
      <Dialog open={createDialog.open} onClose={() => setCreateDialog({ open: false, type: null })}>
        <DialogTitle>Создать {createDialog.type === 'directory' ? 'папку' : 'файл'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={createDialog.type === 'directory' ? 'Имя папки' : 'Имя файла'}
            fullWidth
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog({ open: false, type: null })}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained">Создать</Button>
        </DialogActions>
      </Dialog>

      {/* Диалог переименования */}
      <Dialog open={renameDialog.open} onClose={() => { setRenameDialog({ open: false, item: null, newName: '' }); setRenameError(null); }}>
        <DialogTitle>Переименовать</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Новое имя"
            fullWidth
            value={renameDialog.newName}
            onChange={e => setRenameDialog(prev => ({ ...prev, newName: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm(); }}
          />
          {renameError && (
            <Typography color="error" variant="caption" sx={{ mt: 1 }}>{renameError}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRenameDialog({ open: false, item: null, newName: '' }); setRenameError(null); }}>Отмена</Button>
          <Button onClick={handleRenameConfirm} variant="contained">Переименовать</Button>
        </DialogActions>
      </Dialog>

      {/* Диалог сохранения как */}
      <Dialog open={saveAsDialog.open} onClose={() => { setSaveAsDialog({ open: false, item: null, newName: '', dir: '' }); setSaveAsError(null); }}>
        <DialogTitle>Сохранить как</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Папка назначения"
            fullWidth
            value={saveAsDialog.dir}
            onChange={e => setSaveAsDialog(prev => ({ ...prev, dir: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            autoFocus
            margin="dense"
            label="Новое имя"
            fullWidth
            value={saveAsDialog.newName}
            onChange={e => setSaveAsDialog(prev => ({ ...prev, newName: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAsConfirm(); }}
          />
          {saveAsError && (
            <Typography color="error" variant="caption" sx={{ mt: 1 }}>{saveAsError}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSaveAsDialog({ open: false, item: null, newName: '', dir: '' }); setSaveAsError(null); }}>Отмена</Button>
          <Button onClick={handleSaveAsConfirm} variant="contained">Сохранить</Button>
        </DialogActions>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, item: null })}>
        <DialogTitle>Подтверждение удаления</DialogTitle>
        <DialogContent>
          <Typography>
            Вы уверены, что хотите удалить {deleteDialog.item?.name}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, item: null })}>Отмена</Button>
          <Button onClick={handleDeleteConfirm} variant="contained" color="error">Удалить</Button>
        </DialogActions>
      </Dialog>

      {/* Обновленное контекстное меню */}
      <Menu
        open={contextMenu.open}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu.open ? { top: contextMenu.y, left: contextMenu.x } : undefined}
      >
        {contextMenu.isMultiSelect ? (
          <>
            <MenuItem onClick={() => { 
              selectedItems.forEach(path => {
                const item = files.items.find(f => f.path === path);
                if (item?.type === 'directory') {
                  handleToggleFolder(path);
                } else {
                  onFileSelect(path);
                }
              });
              handleCloseContextMenu();
            }}>Открыть</MenuItem>
            <MenuItem onClick={() => { 
              const items = files?.items?.filter(f => selectedItems.includes(f.path));
              if (items) handleDownload(items);
              handleCloseContextMenu();
            }}>Скачать</MenuItem>
            <MenuItem onClick={() => { 
              selectedItems.forEach(path => handleDelete({ path }));
              handleCloseContextMenu();
            }}>Удалить</MenuItem>
          </>
        ) : (
          <>
            <MenuItem onClick={() => {
              if (contextMenu.item.type === 'directory') {
                handleToggleFolder(contextMenu.item.path);
              } else {
                onFileSelect(contextMenu.item.path);
              }
              handleCloseContextMenu();
            }}>Открыть</MenuItem>
            {/* Новый пункт для .cpp файлов */}
            {contextMenu.item && contextMenu.item.name && contextMenu.item.name.endsWith('.cpp') && (
              <MenuItem onClick={async () => {
                await handleImportToMotionEditor(contextMenu.item);
                handleCloseContextMenu();
              }}>
                Импортировать в редактор движений
              </MenuItem>
            )}
            <MenuItem onClick={handleRename}>Переименовать</MenuItem>
            <MenuItem onClick={handleSaveAs}>Сохранить как</MenuItem>
            <MenuItem onClick={() => { handleDownload(contextMenu.item); handleCloseContextMenu(); }}>Скачать</MenuItem>
            <MenuItem onClick={handleDelete}>Удалить</MenuItem>
          </>
        )}
      </Menu>

      {/* Overlay для drag&drop на всю страницу */}
      {dragOverGlobal && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            bgcolor: 'rgba(30,30,30,0.85)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            pointerEvents: 'auto',
            transition: 'opacity 0.2s',
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 80, color: '#90caf9', mb: 2 }} />
          <Typography variant="h5" sx={{ color: '#e0e0e0', mb: 1 }}>Отпустите для загрузки файлов или папок</Typography>
          <Typography variant="body2" sx={{ color: '#b0b0b0' }}>Можно перетащить сюда файлы или папки из проводника</Typography>
        </Box>
      )}
    </Box>
  );
};

export default FileExplorer; 