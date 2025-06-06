import React, { useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import './FileTree.css';

const FileTreeItem = ({ item, onRename, onDelete, onSaveAs, onMove }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'FILE_TREE_ITEM',
    item: { id: item.id, type: item.type },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: 'FILE_TREE_ITEM',
    drop: (draggedItem) => onMove(draggedItem.id, item.id),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setIsContextMenuOpen(true);
  };

  const handleRename = () => {
    setIsRenaming(true);
    setIsContextMenuOpen(false);
  };

  const handleSaveAs = () => {
    onSaveAs(item);
    setIsContextMenuOpen(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Вы уверены, что хотите удалить ${item.name}?`)) {
      onDelete(item.id);
    }
    setIsContextMenuOpen(false);
  };

  return (
    <div
      ref={(node) => {
        drag(drop(node));
      }}
      className={`file-tree-item ${isDragging ? 'dragging' : ''} ${isOver ? 'drop-target' : ''}`}
      onContextMenu={handleContextMenu}
    >
      {isRenaming ? (
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={() => {
            onRename(item.id, newName);
            setIsRenaming(false);
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              onRename(item.id, newName);
              setIsRenaming(false);
            }
          }}
          autoFocus
        />
      ) : (
        <span>{item.name}</span>
      )}

      {isContextMenuOpen && (
        <div className="context-menu">
          <button onClick={handleRename}>Переименовать</button>
          <button onClick={handleSaveAs}>Сохранить как</button>
          <button onClick={handleDelete}>Удалить</button>
        </div>
      )}
    </div>
  );
};

const FileTree = ({ files, onFileSelect, onRename, onDelete, onSaveAs, onMove }) => {
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="file-tree" style={{ userSelect: 'none' }}>
        {files.map((file) => (
          <FileTreeItem
            key={file.id}
            item={file}
            onRename={onRename}
            onDelete={onDelete}
            onSaveAs={onSaveAs}
            onMove={onMove}
          />
        ))}
      </div>
    </DndProvider>
  );
};

export default FileTree; 