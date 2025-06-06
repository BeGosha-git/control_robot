import React, { useState } from 'react';
import './Editor.css';

const EditorTab = ({ file, isActive, onClose, onSelect, onContextMenu }) => {
  return (
    <div
      className={`editor-tab ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(file.id)}
      onContextMenu={(e) => onContextMenu(e, file)}
    >
      <span className="tab-name">{file.name}</span>
      <button
        className="close-button"
        onClick={(e) => {
          e.stopPropagation();
          onClose(file.id);
        }}
      >
        ×
      </button>
    </div>
  );
};

const Editor = ({ files, activeFileId, onFileSelect, onFileClose, onFileRename, onFileSaveAs }) => {
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, file: null });

  const handleContextMenu = (e, file) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  const handleContextMenuClose = () => {
    setContextMenu({ show: false, x: 0, y: 0, file: null });
  };

  const handleRename = () => {
    if (contextMenu.file) {
      onFileRename(contextMenu.file.id);
    }
    handleContextMenuClose();
  };

  const handleSaveAs = () => {
    if (contextMenu.file) {
      onFileSaveAs(contextMenu.file);
    }
    handleContextMenuClose();
  };

  return (
    <div className="editor-container">
      <div className="editor-tabs">
        {files.map((file) => (
          <EditorTab
            key={file.id}
            file={file}
            isActive={file.id === activeFileId}
            onSelect={onFileSelect}
            onClose={onFileClose}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>
      <div className="editor-toolbar">
        <button className="toolbar-button build">Build</button>
        <button className="toolbar-button reset">Reset</button>
      </div>
      <div className="editor-content">
        {/* Здесь будет содержимое редактора */}
      </div>
      {contextMenu.show && (
        <>
          <div className="context-menu-overlay" onClick={handleContextMenuClose} />
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={handleRename}>Переименовать</button>
            <button onClick={handleSaveAs}>Сохранить как</button>
          </div>
        </>
      )}
    </div>
  );
};

export default Editor; 