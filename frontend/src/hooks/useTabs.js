import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const useTabs = () => {
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState('');

  // Восстановление вкладок при загрузке
  useEffect(() => {
    const savedTabs = Array.from(new Set(JSON.parse(localStorage.getItem('openTabs') || '[]')));
    const savedActiveTab = localStorage.getItem('activeTab') || '';
    
    if (savedTabs.length) {
      Promise.all(savedTabs.map(async (path) => {
        try {
          const res = await api.getFileContent(path);
          return { path, content: res.data.content, exists: true };
        } catch {
          return { path, content: '', exists: false };
        }
      })).then(tabs => {
        const filteredTabs = tabs.filter(tab => tab.exists);
        setOpenTabs(filteredTabs.map(({path, content}) => ({path, content})));
        if (savedActiveTab && filteredTabs.some(tab => tab.path === savedActiveTab)) {
          setActiveTab(savedActiveTab);
        } else if (filteredTabs.length) {
          setActiveTab(filteredTabs[0].path);
        }
      });
    }
  }, []);

  // Сохранение состояния вкладок
  useEffect(() => {
    localStorage.setItem('openTabs', JSON.stringify(openTabs.map(tab => tab.path)));
  }, [openTabs]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const handleFileSelect = useCallback(async (filePath) => {
    if (openTabs.some(tab => tab.path === filePath)) {
      setActiveTab(filePath);
      return;
    }

    try {
      const res = await api.getFileContent(filePath);
      setOpenTabs(prev => [...prev, { path: filePath, content: res.data.content }]);
      setActiveTab(filePath);
    } catch {
      setOpenTabs(prev => [...prev, { path: filePath, content: '' }]);
      setActiveTab(filePath);
    }
  }, [openTabs]);

  const handleEditorChange = useCallback(async (value) => {
    if (!activeTab) return;
    
    try {
      const response = await api.saveFileContent(activeTab, value);
      if (response.data.message) {
        setOpenTabs(prev => prev.map(tab => 
          tab.path === activeTab ? { ...tab, content: value } : tab
        ));
      }
    } catch (error) {
      console.error('Ошибка при сохранении файла:', error);
      console.error('Error details:', error.response?.data);
    }
  }, [activeTab]);

  const handleCloseTab = useCallback((event, tabPath) => {
    event.stopPropagation();
    setOpenTabs(prev => {
      const newTabs = prev.filter(tab => tab.path !== tabPath);
      if (activeTab === tabPath) {
        setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1].path : '');
      }
      return newTabs;
    });
  }, [activeTab]);

  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
  }, []);

  const handleTabsReorder = useCallback((newOrder) => {
    setOpenTabs(prevTabs => {
      const tabMap = new Map(prevTabs.map(tab => [tab.path, tab]));
      return newOrder.map(path => tabMap.get(path)).filter(Boolean);
    });
  }, []);

  const handleAfterDelete = useCallback((deletedPath, isDir = false) => {
    setOpenTabs(prev => prev.filter(tab => {
      if (isDir) {
        return !tab.path.startsWith(deletedPath);
      }
      return tab.path !== deletedPath;
    }));
    
    setActiveTab(prev => {
      if (isDir) {
        return prev && prev.startsWith(deletedPath) ? '' : prev;
      }
      return prev === deletedPath ? '' : prev;
    });
  }, []);

  return {
    openTabs,
    activeTab,
    handleFileSelect,
    handleEditorChange,
    handleCloseTab,
    handleTabChange,
    handleTabsReorder,
    handleAfterDelete
  };
}; 