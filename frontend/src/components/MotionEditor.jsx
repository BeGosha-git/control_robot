import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useAnimation } from '../context/AnimationContext';

  const JOINT_LIMITS = [
    { min: -2.87, max: 2.87 }, // LeftShoulderPitch
    { min: -0.34, max: 3.11 }, // LeftShoulderRoll
    { min: -1.3, max: 4.45 },  // LeftShoulderYaw
    { min: -1.25, max: 2.61 }, // LeftElbow
    { min: -2.87, max: 2.87 }, // RightShoulderPitch
    { min: -3.11, max: 0.34 }, // RightShoulderRoll
    { min: -4.45, max: 1.3 },  // RightShoulderYaw
    { min: -1.25, max: 2.61 }, // RightElbow
    { min: -2.35, max: 2.35 }, // WaistYaw (Torso)
  ];
  const COLUMN_LABELS = ['ShoulderPitch', 'ShoulderRoll', 'ShoulderYaw', 'Elbow'];
  const ROW_LABELS = ['Левая рука', 'Правая рука', 'Торс'];

const isValidNumberInput = value => {
  // Разрешаем числа, числа с точкой или запятой, числа с плавающей точкой, пустую строку
  return /^-?\d*[,.]?\d*$/.test(value);
};

// Добавляем новые функции валидации
const validateCoefficient = value => {
  if (value === '') {
    return { isValid: true, color: 'inherit', message: '' };
  }
  // Проверяем, что это число (включая дробные)
  if (!/^-?\d*\.?\d*$/.test(value)) {
    return { isValid: false, color: '#ef4444', message: 'Только числа' };
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { isValid: true, color: 'inherit', message: '' };
  }
  if (num < 0.1 || num > 5) {
    return { isValid: false, color: '#eab308', message: 'От 0.1 до 5' };
  }
  return { isValid: true, color: 'inherit', message: '' };
};

const validateDuration = value => {
  if (value === '' || !isValidNumberInput(value)) {
    return { isValid: false, color: '#ef4444', message: 'Только числа' };
  }
  const num = parseInt(value);
  if (num < 100) {
    return { isValid: false, color: '#eab308', message: 'Мин. 100 мс' };
  }
  return { isValid: true, color: 'inherit', message: '' };
};

const INIT_BLOCK = {
  id: 'init',
  name: 'Инициализация',
  code: `updateJointPositions(500, init_pos, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 1);`,
  duration: 500,
  positions: [0.39, 0, 0, 0.1, 0.39, 0, 0, 0.1, 0], // Позиция init_pos
  group: 'Системные',
  nonlinearity: 1.2,
  isSystem: true
};

const SHUTDOWN_BLOCK = {
  id: 'shutdown',
  name: 'Завершение',
  code: `updateJointPositions(400, target_pos8, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 2);`,
  duration: 400,
  positions: [0.29, 0, 0, 0.1, 0.29, 0, 0, 0.1, 0], // Позиция target_pos8
  group: 'Системные',
  nonlinearity: 1.2,
  isSystem: true
};

const defaultBlock = () => ({
  id: 'init',
  name: 'Инициализация',
  code: `updateJointPositions(500, init_pos, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 1);`,
  duration: 500,
  positions: [0.39, 0, 0, 0.1, 0.39, 0, 0, 0.1, 0], // Позиция init_pos
  group: 'Системные',
  nonlinearity: 1.2,
  isSystem: true
});

// Обновляем стили для dragStyles
const dragStyles = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  MozUserSelect: 'none',
  msUserSelect: 'none',
  scrollbarWidth: 'thin',
  scrollbarColor: '#334155 #1a1a1a',
  '&::-webkit-scrollbar': {
    width: '8px',
    height: '8px'
  },
  '&::-webkit-scrollbar-track': {
    background: '#1a1a1a'
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#334155',
    borderRadius: '4px',
    '&:hover': {
      background: '#475569'
    }
  }
};

// Выносим компонент блока в отдельный компонент
const MotionBlock = ({ 
  block, 
  index, 
  isSystemBlock, 
  onMove, 
  onUpdate, 
  onSelect, 
  isSelected, 
  isAnimating, 
  collapsedBlocks, 
  onToggleCollapse, 
  onDuplicate, 
  onRemove, 
  durationErrors, 
  coefficientErrors, 
  localPositionsMap, 
  editingFields, 
  onMatrixCellChange, 
  onMatrixCellApply,
  blocks,
  validateInput
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [blockName, setBlockName] = useState(block.name);
  const [isHovered, setIsHovered] = useState(false);

  const handleNameChange = (e) => {
    e.stopPropagation();
    const newName = e.target.value;
    setBlockName(newName);
  };

  const handleNameBlur = () => {
    if (!isSystemBlock) {
      onUpdate(block.id, 'name', blockName);
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div
      style={{
        background: isSystemBlock 
          ? 'linear-gradient(to bottom, #1e293b, #1a1f2b)' 
          : isSelected 
            ? 'linear-gradient(to bottom, #2563eb22, #1e3a8a22)' 
            : 'linear-gradient(to bottom, #23272f, #1a1f2b)',
        borderRadius: 12,
        border: isSystemBlock 
          ? '1px solid #334155' 
          : isSelected 
            ? '2px solid #2563eb' 
            : '1px solid #334155',
        boxShadow: isSelected 
          ? '0 4px 12px rgba(37, 99, 235, 0.15)' 
          : isHovered 
            ? '0 2px 8px rgba(0, 0, 0, 0.2)' 
            : 'none',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: isSystemBlock ? 0.85 : 1,
        cursor: isSystemBlock ? 'default' : 'pointer',
        position: 'relative',
        zIndex: isSelected ? 1 : 'auto',
        transform: isSelected ? 'translateY(-1px)' : 'none',
        ...dragStyles
      }}
      onClick={() => !isSystemBlock && onSelect(block.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Индикатор типа блока */}
      {isSystemBlock && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: block.id === 'init' 
            ? 'linear-gradient(to right, #059669, #10b981)' 
            : 'linear-gradient(to right, #dc2626, #ef4444)',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          opacity: 0.9
        }} />
      )}
      
      {/* Верхняя часть блока */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: 16,
        position: 'relative'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8, 
          flex: 1,
          minWidth: 0 
        }}>
          {/* Кнопки перемещения */}
          {!isSystemBlock && (
            <div style={{ 
              display: 'flex', 
              gap: 2,
              opacity: isHovered ? 1 : 0.6,
              transition: 'opacity 0.2s'
            }}>
              <button 
                title="Переместить вверх" 
                onClick={e => { 
                  e.stopPropagation(); 
                  onMove(block.id, 'up'); 
                }} 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#64748b',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: 6,
                  transition: 'all 0.2s',
                  opacity: index <= 1 ? 0.3 : 1,
                  pointerEvents: index <= 1 ? 'none' : 'auto',
                  padding: 0,
                  '&:hover': {
                    background: '#334155',
                    color: '#94a3b8',
                    transform: 'translateY(-1px)'
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
              <button 
                title="Переместить вниз" 
                onClick={e => { 
                  e.stopPropagation(); 
                  onMove(block.id, 'down'); 
                }} 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#64748b',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: 6,
                  transition: 'all 0.2s',
                  opacity: index >= blocks.length - 2 ? 0.3 : 1,
                  pointerEvents: index >= blocks.length - 2 ? 'none' : 'auto',
                  padding: 0,
                  '&:hover': {
                    background: '#334155',
                    color: '#94a3b8',
                    transform: 'translateY(1px)'
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          )}

          {/* Название блока */}
          {isSystemBlock ? (
            <div style={{ 
              background: 'linear-gradient(to bottom, #181c24, #1a1f2b)', 
              color: '#94a3b8', 
              border: '1px solid #334155', 
              borderRadius: 8, 
              padding: '6px 12px',
              flex: 1,
              fontSize: 14,
              fontWeight: 500,
              userSelect: 'none',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
            }}>
              {block.name}
            </div>
          ) : isEditingName ? (
            <input
              type="text"
              value={blockName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              onClick={e => e.stopPropagation()}
              autoFocus
              style={{ 
                background: 'linear-gradient(to bottom, #181c24, #1a1f2b)', 
                color: '#fff', 
                border: '1px solid #2563eb', 
                borderRadius: 8, 
                padding: '6px 12px',
                flex: 1,
                fontSize: 14,
                fontWeight: 500,
                outline: 'none',
                boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
                transition: 'all 0.2s'
              }}
            />
          ) : (
            <div 
              style={{ 
                background: 'linear-gradient(to bottom, #181c24, #1a1f2b)', 
                color: '#fff', 
                border: '1px solid #334155', 
                borderRadius: 8, 
                padding: '6px 12px',
                flex: 1,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'text',
                userSelect: 'none',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: '#475569',
                  background: 'linear-gradient(to bottom, #1e293b, #1f2937)'
                }
              }}
              onClick={e => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
            >
              {block.name}
            </div>
          )}
        </div>
        
        {/* Правая часть с контролами */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12,
          flexShrink: 0
        }}>
          {/* Поле времени */}
          <label style={{ 
            color: '#94a3b8', 
            fontSize: 13, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            position: 'relative' 
          }}>
            Время:
            <input
              type="text"
              value={block.duration}
              onChange={e => {
                e.stopPropagation();
                const value = e.target.value;
                if (isValidNumberInput(value)) {
                  onUpdate(block.id, 'duration', parseInt(value) || 0);
                }
                const validation = validateDuration(value);
                onUpdate(block.id, 'durationErrors', { ...durationErrors, [block.id]: validation.message });
              }}
              onBlur={e => {
                const value = e.target.value;
                if (value === '' || !isValidNumberInput(value)) {
                  onUpdate(block.id, 'duration', 1000);
                } else {
                  const num = parseInt(value);
                  if (num < 100) {
                    onUpdate(block.id, 'duration', 100);
                  }
                }
              }}
              style={{ 
                background: 'linear-gradient(to bottom, #181c24, #1a1f2b)', 
                color: '#fff', 
                border: `1px solid ${durationErrors[block.id] ? '#ef4444' : '#334155'}`, 
                borderRadius: 6, 
                padding: '6px 10px',
                width: 80,
                fontSize: 13,
                fontWeight: 500,
                opacity: isSystemBlock ? 0.8 : 1,
                transition: 'all 0.2s',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                '&:focus': {
                  borderColor: '#2563eb',
                  boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
                  outline: 'none'
                }
              }}
            />
            {durationErrors[block.id] && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#181c24',
                color: '#ef4444',
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                zIndex: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                border: '1px solid #ef4444',
                marginTop: 4
              }}>
                {durationErrors[block.id]}
              </div>
            )}
          </label>
          
          {/* Поле коэффициента */}
          {!isSystemBlock && (
            <label style={{ 
              color: '#94a3b8', 
              fontSize: 13, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6, 
              position: 'relative' 
            }}>
                Коэфф.:
                <input
                  type="text"
                  value={block.nonlinearity ?? 1}
                  onChange={e => {
                    e.stopPropagation();
                    const value = e.target.value;
                    if (/^-?\d*\.?\d*$/.test(value)) {
                      onUpdate(block.id, 'nonlinearity', value);
                      const validation = validateCoefficient(value);
                      onUpdate(block.id, 'coefficientErrors', { ...coefficientErrors, [block.id]: validation.message });
                    }
                  }}
                  onBlur={e => {
                    const value = e.target.value;
                    if (value === '') {
                      onUpdate(block.id, 'nonlinearity', 1);
                    } else {
                      const num = parseFloat(value);
                      if (isNaN(num)) {
                        onUpdate(block.id, 'nonlinearity', 1);
                      } else if (num < 0.1) {
                        onUpdate(block.id, 'nonlinearity', 0.1);
                      } else if (num > 5) {
                        onUpdate(block.id, 'nonlinearity', 5);
                      } else {
                        onUpdate(block.id, 'nonlinearity', value);
                      }
                    }
                  }}
                  style={{ 
                  background: 'linear-gradient(to bottom, #181c24, #1a1f2b)', 
                    color: '#fff', 
                  border: `1px solid ${coefficientErrors[block.id] ? '#ef4444' : '#334155'}`, 
                  borderRadius: 6, 
                  padding: '6px 10px',
                  width: 80,
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                  '&:focus': {
                    borderColor: '#2563eb',
                    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
                    outline: 'none'
                  }
                  }}
                />
                {coefficientErrors[block.id] && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    background: '#181c24',
                    color: '#ef4444',
                    fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 4,
                    whiteSpace: 'nowrap',
                  zIndex: 1,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  border: '1px solid #ef4444',
                  marginTop: 4
                  }}>
                    {coefficientErrors[block.id]}
                  </div>
                )}
              </label>
          )}

          {/* Кнопки управления */}
          {!isSystemBlock && (
            <div style={{ 
              display: 'flex', 
              gap: 4, 
              marginLeft: 'auto',
              opacity: isHovered ? 1 : 0.6,
              transition: 'opacity 0.2s'
            }}>
                <button 
                  title="Дублировать движение" 
                  onClick={e => { 
                    e.stopPropagation(); 
                    onDuplicate(block.id); 
                  }} 
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: '#64748b',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  borderRadius: 8,
                  transition: 'all 0.2s',
                  '&:hover': {
                    background: '#334155',
                    color: '#94a3b8',
                    transform: 'translateY(-1px)'
                  }
                }}
                >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <button 
                  title="Удалить движение" 
                  onClick={e => { 
                    e.stopPropagation(); 
                    onRemove(block.id); 
                  }} 
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: '#64748b',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  borderRadius: 8,
                  transition: 'all 0.2s',
                  '&:hover': {
                    background: '#ef444422',
                    color: '#ef4444',
                    transform: 'translateY(-1px)'
                  }
                }}
                >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
                <button 
                  title="Свернуть матрицу" 
                  onClick={e => onToggleCollapse(block.id, e)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: '#64748b',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  borderRadius: 8,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: collapsedBlocks[block.id] ? 'rotate(-90deg)' : 'rotate(0deg)',
                  '&:hover': {
                    background: '#334155',
                    color: '#94a3b8',
                    transform: collapsedBlocks[block.id] 
                      ? 'rotate(-90deg) translateY(-1px)' 
                      : 'rotate(0deg) translateY(-1px)'
                  }
                }}
                >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
          )}
        </div>
      </div>

      {/* Матрица движений */}
      {!isSystemBlock && !collapsedBlocks[block.id] && (
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '12px',
          background: 'linear-gradient(to bottom, #181c24, #1a1f2b)',
          borderRadius: 8,
          padding: '12px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: isAnimating ? 0.5 : 1,
          pointerEvents: isAnimating ? 'none' : 'auto',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
        }}>
          {/* Левая рука */}
          <div style={{ 
            color: '#fff', 
            fontSize: 13, 
            padding: '6px 12px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center'
          }}>
            {ROW_LABELS[0]}
          </div>
          <div style={{ 
            display: 'flex', 
            gap: 8,
            flexWrap: 'wrap'
          }}>
            {[0,1,2,3].map((index) => {
              const validation = validateInput(block.positions[index], index);
              return (
                <input
                  key={index}
                  type="text"
                  value={localPositionsMap[block.id]?.[index] ?? block.positions[index]}
                  onFocus={() => {
                    onUpdate(block.id, 'editingFields', { ...editingFields, [block.id]: { ...editingFields[block.id], [index]: true } });
                    onSelect(block.id);
                  }}
                  onBlur={() => onMatrixCellApply(block.id, index)}
                  onChange={e => onMatrixCellChange(block.id, index, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                  style={{ 
                    width: 70,
                    background: 'linear-gradient(to bottom, #23272f, #1e293b)', 
                    color: validation.color,
                    border: `1px solid ${validation.color === 'inherit' ? '#334155' : validation.color}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: isAnimating ? 0.5 : 1,
                    cursor: isAnimating ? 'not-allowed' : 'text',
                    transition: 'all 0.2s',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                    '&:focus': {
                      borderColor: '#2563eb',
                      boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
                      outline: 'none'
                    }
                  }}
                  disabled={isAnimating}
                />
              );
            })}
          </div>

          {/* Правая рука */}
          <div style={{ 
            color: '#fff', 
            fontSize: 13, 
            padding: '6px 12px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center'
          }}>
            {ROW_LABELS[1]}
          </div>
          <div style={{ 
            display: 'flex', 
            gap: 8,
            flexWrap: 'wrap'
          }}>
            {[4,5,6,7].map((index) => {
              const validation = validateInput(block.positions[index], index);
              return (
                <input
                  key={index}
                  type="text"
                  value={localPositionsMap[block.id]?.[index] ?? block.positions[index]}
                  onFocus={() => {
                    onUpdate(block.id, 'editingFields', { ...editingFields, [block.id]: { ...editingFields[block.id], [index]: true } });
                    onSelect(block.id);
                  }}
                  onBlur={() => onMatrixCellApply(block.id, index)}
                  onChange={e => onMatrixCellChange(block.id, index, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                  style={{ 
                    width: 70,
                    background: 'linear-gradient(to bottom, #23272f, #1e293b)', 
                    color: validation.color,
                    border: `1px solid ${validation.color === 'inherit' ? '#334155' : validation.color}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: isAnimating ? 0.5 : 1,
                    cursor: isAnimating ? 'not-allowed' : 'text',
                    transition: 'all 0.2s',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                    '&:focus': {
                      borderColor: '#2563eb',
                      boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
                      outline: 'none'
                    }
                  }}
                  disabled={isAnimating}
                />
              );
            })}
          </div>

          {/* Торс */}
          <div style={{ 
            color: '#fff', 
            fontSize: 13, 
            padding: '6px 12px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center'
          }}>
            {ROW_LABELS[2]}
          </div>
          <div style={{ 
            display: 'flex', 
            gap: 8,
            flexWrap: 'wrap'
          }}>
            {(() => {
              const validation = validateInput(block.positions[8], 8);
              return (
                <input
                  type="text"
                  value={localPositionsMap[block.id]?.[8] ?? block.positions[8]}
                  onFocus={() => {
                    onUpdate(block.id, 'editingFields', { ...editingFields, [block.id]: { ...editingFields[block.id], [8]: true } });
                    onSelect(block.id);
                  }}
                  onBlur={() => onMatrixCellApply(block.id, 8)}
                  onChange={e => onMatrixCellChange(block.id, 8, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                  style={{ 
                    width: 70,
                    background: 'linear-gradient(to bottom, #23272f, #1e293b)', 
                    color: validation.color,
                    border: `1px solid ${validation.color === 'inherit' ? '#334155' : validation.color}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: isAnimating ? 0.5 : 1,
                    cursor: isAnimating ? 'not-allowed' : 'text',
                    transition: 'all 0.2s',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                    '&:focus': {
                      borderColor: '#2563eb',
                      boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
                      outline: 'none'
                    }
                  }}
                  disabled={isAnimating}
                />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

// Добавляем функцию для анализа файла с движениями
export const analyzeMotionFile = (fileContent) => {
  // Ищем определения констант
  const kPiMatch = fileContent.match(/constexpr\s+float\s+kPi\s*=\s*([\d.]+)/);
  const kPi2Match = fileContent.match(/constexpr\s+float\s+kPi_2\s*=\s*([\d.]+)/);
  
  const kPi = kPiMatch ? parseFloat(kPiMatch[1]) : 3.141592654;
  const kPi2 = kPi2Match ? parseFloat(kPi2Match[1]) : 1.57079632;

  // Функция для преобразования значения с учетом констант и арифметики +, -
  const parseValue = (value) => {
    value = value.trim();
    value = value.replace(/[};]+$/, '').trim();
    // Удаляем все пробелы для корректного парсинга арифметики
    value = value.replace(/\s+/g, '');
    if (/[-+]/.test(value.slice(1))) {
      const parts = value.match(/([+-]?[^+-]+)/g);
      if (parts) {
        let result = parseSingle(parts[0]);
        for (let i = 1; i < parts.length; i++) {
          result += parseSingle(parts[i]);
        }
        return result;
      }
    }
    return parseSingle(value);
  };

  // Функция для разбора одного значения (без арифметики)
  function parseSingle(val) {
    val = val.trim();
    if (val === 'kPi') return kPi;
    if (val === 'kPi_2') return kPi2;
    if (val.endsWith('f')) {
      return parseFloat(val.slice(0, -1));
    }
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  // Ищем все определения массивов с движениями
  const arrayDefinitions = fileContent.match(/std::array<float, 9>\s+(\w+)\s*=\s*{([^}]+)}/g) || [];
  const motionBlocks = [];
  let movementCounter = 1; // Счетчик для нумерации движений

  // Обрабатываем каждое определение
  arrayDefinitions.forEach(def => {
    const match = def.match(/std::array<float, 9>\s+(\w+)\s*=\s*{([^}]+)}/);
    if (!match) return;

    const varName = match[1];
    // Разбиваем весь массив на строки, сохраняя структуру
    const arrayContent = match[2];
    const lines = arrayContent.split('\n').map(line => line.trim()).filter(line => line);
    
    // Собираем все значения, игнорируя комментарии
    const values = [];
    lines.forEach((line, idx) => {
      // Разбиваем строку на значения и комментарии
      const parts = line.split('//').map(p => p.trim());
      let valuesPart = parts[0];
      // Удаляем точку с запятой в конце строки (особенно для торса)
      if (valuesPart.endsWith(';')) {
        valuesPart = valuesPart.slice(0, -1).trim();
      }
      // Разбиваем значения по запятым
      let lineValues = valuesPart.split(',')
        .map(v => v.trim())
        .filter(v => v !== '' && v !== undefined)
        .map(v => {
          // Обрабатываем каждое значение, учитывая константы
          const parts = v.split('*').map(part => part.trim());
          if (parts.length > 1) {
            return parts.reduce((acc, part) => {
              const num = parseValue(part);
              return acc * (isNaN(num) ? 1 : num);
            }, 1);
          }
          return parseValue(v);
        });
      // Если это последняя строка и нет запятых, но есть значение — добавляем как последний элемент (торс)
      if (idx === lines.length - 1 && lineValues.length === 0 && valuesPart !== '') {
        lineValues = [parseValue(valuesPart)];
      }
      values.push(...lineValues);
    });

    // Проверяем, что у нас ровно 9 значений
    if (values.length !== 9) {
      console.warn(`Пропущен массив ${varName}: неверное количество значений (${values.length})`);
      return;
    }

    // Ищем использование этой переменной в updateJointPositions
    const usageRegex = new RegExp(
      `updateJointPositions\\((\\d+),\\s*${varName},[^,]+,\\s*([\\d.]+)f[^)]*\\)`
    );
    const usageMatch = fileContent.match(usageRegex);

    if (usageMatch) {
      const duration = parseInt(usageMatch[1]);
      const nonlinearity = parseFloat(usageMatch[2]);
      // Имя блока = имя переменной массива
      const name = varName;
      motionBlocks.push({
        id: Date.now().toString() + motionBlocks.length,
        name: name,
        duration: duration,
        positions: values,
        nonlinearity: nonlinearity,
        isSystem: false
      });
    }
  });

  // 1. Сначала ищем все inline-массивы в updateJointPositions
  const inlineRegex = /updateJointPositions\((\d+),\s*\{([^}]+)\},[^,]+,\s*([\d.]+)f[^)]*\)/g;
  let inlineMatch;
  let inlineCounter = 1;
  while ((inlineMatch = inlineRegex.exec(fileContent)) !== null) {
    const duration = parseInt(inlineMatch[1]);
    const arrayContent = inlineMatch[2];
    const nonlinearity = parseFloat(inlineMatch[3]);
    // Парсим массив позиций (аналогично массивам-переменным)
    const lines = arrayContent.split('\n').map(line => line.trim()).filter(line => line);
    const values = [];
    lines.forEach((line, idx) => {
      let valuesPart = line;
      if (valuesPart.endsWith(';')) {
        valuesPart = valuesPart.slice(0, -1).trim();
      }
      let lineValues = valuesPart.split(',')
        .map(v => v.trim())
        .filter(v => v !== '' && v !== undefined)
        .map(v => {
          const parts = v.split('*').map(part => part.trim());
          if (parts.length > 1) {
            return parts.reduce((acc, part) => {
              const num = parseValue(part);
              return acc * (isNaN(num) ? 1 : num);
            }, 1);
          }
          return parseValue(v);
        });
      if (idx === lines.length - 1 && lineValues.length === 0 && valuesPart !== '') {
        lineValues = [parseValue(valuesPart)];
      }
      values.push(...lineValues);
    });
    if (values.length === 9) {
      motionBlocks.push({
        id: Date.now().toString() + motionBlocks.length,
        name: `inline_${inlineCounter++}`,
        duration: duration,
        positions: values,
        nonlinearity: nonlinearity,
        isSystem: false
      });
    }
  }

  return motionBlocks;
};

const MotionEditor = ({ onSave, onPositionsChange, onAnimate, blocks, setBlocks, selectedBlockId, setSelectedBlockId }) => {
  const [filename, setFilename] = useState('motion.cpp');
  const [showPreview, setShowPreview] = useState(false);
  const [previewPositions, setPreviewPositions] = useState([]);
  const [validFiles, setValidFiles] = useState([]);
  const editorRef = useRef(null);
  const [activeCell, setActiveCell] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState(null);
  const animationRef = useRef(null);
  const prevPositionsRef = useRef(Array(9).fill(0));
  const [pendingAnimation, setPendingAnimation] = useState(null);
  const [editingFields, setEditingFields] = useState({});
  const [localPositionsMap, setLocalPositionsMap] = useState({});
  const [coefficientErrors, setCoefficientErrors] = useState({});
  const [durationErrors, setDurationErrors] = useState({});
  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  const [pendingPath, setPendingPath] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const dropdownRef = useRef(null);
  const { setPositionsInstant } = useAnimation();

  const selectedBlockData = blocks.find(b => b.id === selectedBlockId);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  // Инициализация с системными блоками
  useEffect(() => {
    // Проверяем, есть ли уже системные блоки
    const hasInitBlock = blocks.some(b => b.id === 'init');
    const hasShutdownBlock = blocks.some(b => b.id === 'shutdown');
    
    if (!hasInitBlock || !hasShutdownBlock) {
      // Если нет системных блоков, создаем их
      const newBlocks = [];
      
      // Добавляем блок инициализации, если его нет
      if (!hasInitBlock) {
        newBlocks.push(INIT_BLOCK);
      }
      
      // Добавляем существующие несистемные блоки
      const nonSystemBlocks = blocks.filter(b => !b.isSystem);
      newBlocks.push(...nonSystemBlocks);
      
      // Добавляем блок завершения, если его нет
      if (!hasShutdownBlock) {
        newBlocks.push(SHUTDOWN_BLOCK);
      }
      
      setBlocks(newBlocks);
      
      // Выбираем первый несистемный блок, если есть
      if (nonSystemBlocks.length > 0) {
        setSelectedBlockId(nonSystemBlocks[0].id);
      }
    }
  }, []); // Запускаем только при монтировании

  const addBlock = () => {
    const newBlock = defaultBlock();
    // Вставляем новый блок перед блоком завершения
    const shutdownIndex = blocks.findIndex(b => b.id === 'shutdown');
    const newBlocks = [...blocks];
    newBlocks.splice(shutdownIndex, 0, newBlock);
    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
  };

  const removeBlock = (id) => {
    const block = blocks.find(b => b.id === id);
    if (block?.isSystem) return; // Запрещаем удаление системных блоков
    
    setBlocks(blocks.filter(block => block.id !== id));
    if (selectedBlockId === id) {
      // Выбираем первый несистемный блок
      const firstNonSystemBlock = blocks.find(b => !b.isSystem);
      setSelectedBlockId(firstNonSystemBlock?.id || '');
    }
  };

  const duplicateBlock = (id) => {
    const blockToDuplicate = blocks.find(b => b.id === id);
    if (!blockToDuplicate || blockToDuplicate.isSystem) return;
    
    const newBlock = {
      ...blockToDuplicate,
      id: Date.now().toString(),
      name: `${blockToDuplicate.name} (копия)`,
    };
    
    // Вставляем копию перед блоком завершения
    const shutdownIndex = blocks.findIndex(b => b.id === 'shutdown');
    const newBlocks = [...blocks];
    newBlocks.splice(shutdownIndex, 0, newBlock);
    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
  };

  const updateBlock = (id, field, value) => {
    setBlocks(blocks => blocks.map(block => {
      if (block.id === id) {
        const updatedBlock = { ...block, [field]: value };
        
        // Если обновляются позиции, обновляем и локальные позиции
        if (field === 'positions') {
          setLocalPositionsMap(prev => ({
            ...prev,
            [id]: value.reduce((acc, val, idx) => ({
              ...acc,
              [idx]: editingFields[id]?.[idx] ? prev[id]?.[idx] : (val === undefined ? '' : val)
            }), {})
          }));
        }
        
        if (field === 'positions' && onPositionsChange) {
          onPositionsChange(value);
        }
        return updatedBlock;
      }
      return block;
    }));
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    
    // Проверяем, не пытаемся ли мы переместить системный блок
    if (blocks[sourceIndex].isSystem) return;
    
    // Проверяем, не пытаемся ли мы переместить блок на место системного блока
    if (blocks[destIndex].isSystem) return;
    
    // Создаем новый массив блоков
    const newBlocks = Array.from(blocks);
    const [movedBlock] = newBlocks.splice(sourceIndex, 1);
    newBlocks.splice(destIndex, 0, movedBlock);
    
    // Проверяем, что системные блоки остались на своих местах
    const initBlock = newBlocks.find(b => b.id === 'init');
    const shutdownBlock = newBlocks.find(b => b.id === 'shutdown');
    
    if (!initBlock || !shutdownBlock || 
        newBlocks.indexOf(initBlock) !== 0 || 
        newBlocks.indexOf(shutdownBlock) !== newBlocks.length - 1) {
      // Если системные блоки сдвинулись, восстанавливаем их позиции
      const nonSystemBlocks = newBlocks.filter(b => !b.isSystem);
      setBlocks([INIT_BLOCK, ...nonSystemBlocks, SHUTDOWN_BLOCK]);
    } else {
      setBlocks(newBlocks);
    }
  };

  const validateInput = (value, index) => {
    if (value === '' || isNaN(value)) return { isValid: false, color: '#ef4444' };
    const num = parseFloat(value);
    if (num < JOINT_LIMITS[index].min || num > JOINT_LIMITS[index].max) {
      return { isValid: false, color: '#eab308' };
    }
    return { isValid: true, color: 'inherit' };
  };

  // Обновляем логику переключения между блоками
  useEffect(() => {
    if (!selectedBlockData || isAnimating) return;

    const currentBlock = blocks.find(b => b.id === selectedBlockId);
    if (!currentBlock) return;

    // Находим индекс текущего и целевого блоков
    const currentIdx = blocks.findIndex(b => 
      b.positions.every((pos, i) => Math.abs(pos - prevPositionsRef.current[i]) < 0.001)
    );
    const targetIdx = blocks.findIndex(b => b.id === selectedBlockId);

    if (currentIdx === -1 || targetIdx === -1) return;

    // Определяем направление движения и собираем блоки для анимации
    const blocksToAnimate = [];
    if (currentIdx <= targetIdx) {
      for (let i = currentIdx; i <= targetIdx; i++) {
        blocksToAnimate.push(blocks[i]);
      }
    } else {
      for (let i = currentIdx; i >= targetIdx; i--) {
        blocksToAnimate.push(blocks[i]);
      }
    }

    // Запускаем анимацию последовательности блоков с их duration
    setIsAnimating(true);
    animateBlockSequenceWithDuration(blocksToAnimate, 0);
  }, [selectedBlockId]);

  // Функция для анимации последовательности блоков с учётом duration каждого блока
  const animateBlockSequenceWithDuration = (blocks, currentBlockIndex) => {
    if (currentBlockIndex >= blocks.length) {
      setIsAnimating(false);
      const finalPositions = blocks[blocks.length - 1].positions.map(p => parseFloat(p) || 0);
      prevPositionsRef.current = [...finalPositions];
      if (onPositionsChange) {
        onPositionsChange(finalPositions);
      }
      return;
    }

    const block = blocks[currentBlockIndex];
    const startPositions = currentBlockIndex === 0 
      ? [...prevPositionsRef.current]
      : blocks[currentBlockIndex - 1].positions.map(p => parseFloat(p) || 0);
    const targetPositions = block.positions.map(p => parseFloat(p) || 0);

    const hasChanges = startPositions.some((pos, i) => Math.abs(pos - targetPositions[i]) > 0.001);
    if (!hasChanges) {
      animateBlockSequenceWithDuration(blocks, currentBlockIndex + 1);
      return;
    }

    let startTime = null;
    let lastUpdateTime = null;
    let animationFrame = null;

    const animate = (timestamp) => {
      if (!startTime) {
        startTime = timestamp;
        lastUpdateTime = timestamp;
      }
      const elapsed = timestamp - startTime;
      const deltaTime = Math.min(timestamp - lastUpdateTime, 16);
      lastUpdateTime = timestamp;
      const duration = block.duration; // используем duration текущего блока
      const nonlinearity = parseFloat(block.nonlinearity) || 1.0;
      if (elapsed >= duration) {
        if (onPositionsChange) {
          onPositionsChange(targetPositions, true);
        }
        animateBlockSequenceWithDuration(blocks, currentBlockIndex + 1);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const t = Math.pow(progress, nonlinearity);
      const currentPositions = startPositions.map((start, i) => {
        const diff = targetPositions[i] - start;
        const smoothT = t * t * (3 - 2 * t);
        return start + diff * smoothT;
      });
      if (onPositionsChange) {
        onPositionsChange(currentPositions, true);
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    animationRef.current = animationFrame;
  };

  // Очистка анимации при размонтировании
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setIsAnimating(false);
    };
  }, []);

  useEffect(() => {
    const selectedBlock = blocks.find(b => b.id === selectedBlockId);
    if (!selectedBlock) return;

    // Инициализируем локальные позиции для блока, если их нет
    if (!localPositionsMap[selectedBlockId]) {
      setLocalPositionsMap(prev => ({
        ...prev,
        [selectedBlockId]: selectedBlock.positions.reduce((acc, val, idx) => ({
          ...acc,
          [idx]: val === undefined ? '' : val
        }), {})
      }));
    }
  }, [blocks, selectedBlockId]);

  // Обновляем функцию handleMatrixCellChange
  const handleMatrixCellChange = (blockId, index, value) => {
    // Если идет анимация, игнорируем изменения
    if (isAnimating) return;
    
    if (!isValidNumberInput(value)) return;
    
    setLocalPositionsMap(prev => ({
      ...prev,
      [blockId]: {
        ...prev[blockId],
        [index]: value
      }
    }));
    
    setEditingFields(prev => ({
      ...prev,
      [blockId]: {
        ...prev[blockId],
        [index]: true
      }
    }));
    // Немедленно обновляем позу
    if (blockId === selectedBlockId) {
      const currentBlock = blocks.find(b => b.id === blockId);
      if (currentBlock) {
        const newPositions = [...currentBlock.positions];
        newPositions[index] = value === '' || isNaN(Number(value)) ? 0 : Number(value);
        setPositionsInstant(newPositions);
      }
    }
  };

  // Обновляем функцию handleMatrixCellApply
  const handleMatrixCellApply = (blockId, index) => {
    // Если идет анимация, игнорируем изменения
    if (isAnimating) return;

    setEditingFields(prev => ({
      ...prev,
      [blockId]: {
        ...prev[blockId],
        [index]: false
      }
    }));

    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const newPositions = [...block.positions];
    const val = localPositionsMap[blockId]?.[index];
    newPositions[index] = val === '' || isNaN(Number(val)) ? 0 : Number(val);
    
    updateBlock(blockId, 'positions', newPositions);
    if (onPositionsChange && blockId === selectedBlockId) {
      onPositionsChange(newPositions);
    }
  };

  const handleMatrixRowHover = (positions) => {
    setPreviewPositions(positions);
    setShowPreview(true);
  };

  const handleMatrixRowLeave = () => {
    setShowPreview(false);
  };

  // При генерации кода: преобразуем значения к числам или к строке с 'f'
  const formatPosition = val => {
    if (val === '' || isNaN(Number(val))) return 0;
    const num = Number(val);
    return Number.isInteger(num) ? num : `${num}f`;
  };

  const getNextBlockName = () => {
    const userBlocks = blocks.filter(b => !b.isSystem);
    const maxNumber = userBlocks.reduce((max, block) => {
      const match = block.name.match(/Движение (\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    return `Движение ${maxNumber + 1}`;
  };

  const defaultBlock = () => ({
    id: Date.now().toString(),
    name: getNextBlockName(),
    code: `updateJointPositions(1000, target_pos, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher);`,
    duration: 1000,
    positions: Array(9).fill(0),
    group: 'Основные',
    nonlinearity: 1.0,
    isSystem: false
  });

  const moveBlock = (blockId, direction) => {
    const currentIndex = blocks.findIndex(b => b.id === blockId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex <= 0 || newIndex >= blocks.length - 1) return; // Не двигаем системные блоки

    const newBlocks = [...blocks];
    const [movedBlock] = newBlocks.splice(currentIndex, 1);
    newBlocks.splice(newIndex, 0, movedBlock);
    setBlocks(newBlocks);
  };

  const generateCode = () => {
    const header = `#include <array>
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>
#include <cmath>

#include <unitree/idl/go2/LowCmd_.hpp>
#include <unitree/idl/hg/LowState_.hpp>
#include <unitree/robot/channel/channel_publisher.hpp>
#include <unitree/robot/channel/channel_subscriber.hpp>

static const std::string kTopicArmSDK = "rt/arm_sdk";
static const std::string kTopicState = "rt/lowstate";
constexpr float kPi = 3.141592654;
constexpr float kPi_2 = 1.57079632;

int version_debug = 1291;

using namespace std;

enum JointIndex
{
    // Right leg
    kRightHipYaw = 8,
    kRightHipRoll = 0,
    kRightHipPitch = 1,
    kRightKnee = 2,
    kRightAnkle = 11,
    // Left leg
    kLeftHipYaw = 7,
    kLeftHipRoll = 3,
    kLeftHipPitch = 4,
    kLeftKnee = 5,
    kLeftAnkle = 10,
    kWaistYaw = 6,
    kNotUsedJoint = 9,
    // Right arm
    kRightShoulderPitch = 12,
    kRightShoulderRoll = 13,
    kRightShoulderYaw = 14,
    kRightElbow = 15,
    // Left arm
    kLeftShoulderPitch = 16,
    kLeftShoulderRoll = 17,
    kLeftShoulderYaw = 18,
    kLeftElbow = 19,
};

// Начальная позиция
std::array<float, 9> init_pos{0.29f, 0, 0, 0.1f, // левая рука
                              0.29f, 0, 0, 0.1f,
                              0};

// Позиция завершения
std::array<float, 9> target_pos8 = {0.39f, 0, 0, 0.1f, // левая рука
                                    0.39f, 0, 0, 0.1f,
                                    0};
void updateJointPositions(int num_time_steps, const std::array<float, 9> &target_position, std::array<float, 9> &current_jpos_des, float phase_koef, unitree_go::msg::dds_::LowCmd_ &msg, const std::array<JointIndex, 9> &arm_joints, std::shared_ptr<unitree::robot::ChannelPublisher<unitree_go::msg::dds_::LowCmd_>> &arm_sdk_publisher, int start_stop = 0)
{
    std::array<float, 9> initial_jpos = current_jpos_des;
    std::array<float, 9> deltas;
    float weight = 0.f;

    float kp = 60.f;
    float kd = 1.5f;
    float dq = 0.f;
    float tau_ff = 1.0f;

    if (start_stop == 1){
        weight = 0.f;
    } else if (start_stop == 2) {
        weight = 1.f;
    }

    for (size_t j = 0; j < 9; ++j)
    {
        deltas[j] = target_position[j] - initial_jpos[j];
    }

    for (int i = 0; i < num_time_steps; ++i)
    {
        float t = (num_time_steps <= 1) ? 1.0f
                                        : static_cast<float>(i) / (num_time_steps - 1);

        float s = std::pow(t, phase_koef);
        
        if (start_stop == 1){
            weight = 1.f * ((i + 1) / num_time_steps);
            msg.motor_cmd().at(JointIndex::kNotUsedJoint).q(weight);
        } else if (start_stop == 2) {
            weight = 1.f * (1.f - static_cast<float>(i) / num_time_steps);
            msg.motor_cmd().at(JointIndex::kNotUsedJoint).q(weight);
        }
        for (size_t j = 0; j < 9; ++j)
        {
            float desired = initial_jpos[j] + deltas[j] * s;
            current_jpos_des[j] = desired;
            auto &motor_cmd = msg.motor_cmd().at(arm_joints[j]);
            motor_cmd.q(current_jpos_des[j]);
            motor_cmd.dq(dq);
            motor_cmd.kp(kp);
            motor_cmd.kd(kd);
            motor_cmd.tau(tau_ff);
        }

        arm_sdk_publisher->Write(msg);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
}

int main(int argc, char const *argv[])
{
    if (argc < 2)
    {
        std::cout << "Usage: " << argv[0] << " networkInterface" << std::endl;
        exit(-1);
    }

    unitree::robot::ChannelFactory::Instance()->Init(0, argv[1]);

    auto arm_sdk_publisher = std::make_shared<unitree::robot::ChannelPublisher<unitree_go::msg::dds_::LowCmd_>>(kTopicArmSDK);
    arm_sdk_publisher->InitChannel();

    unitree::robot::ChannelSubscriberPtr<unitree_hg::msg::dds_::LowState_> low_state_subscriber;

    // Создание подписчика
    unitree_hg::msg::dds_::LowState_ state_msg;
    low_state_subscriber.reset(
        new unitree::robot::ChannelSubscriber<unitree_hg::msg::dds_::LowState_>(kTopicState));
    low_state_subscriber->InitChannel([&](const void *msg)
                                      {
        auto s = (const unitree_hg::msg::dds_::LowState_*)msg;
        memcpy(&state_msg, s, sizeof(unitree_hg::msg::dds_::LowState_)); }, 1);

    // Массив суставов рук
    std::array<JointIndex, 9> arm_joints = {
        JointIndex::kLeftShoulderPitch, JointIndex::kLeftShoulderRoll,
        JointIndex::kLeftShoulderYaw, JointIndex::kLeftElbow,
        JointIndex::kRightShoulderPitch, JointIndex::kRightShoulderRoll,
        JointIndex::kRightShoulderYaw, JointIndex::kRightElbow, JointIndex::kWaistYaw};

    // Начальная позиция суставов
    std::array<float, 9> current_jpos{};
    std::cout << "Current joint position: ";
    for (int i = 0; i < arm_joints.size(); ++i)
    {
        current_jpos.at(i) = state_msg.motor_state().at(arm_joints.at(i)).q();
        std::cout << current_jpos.at(i) << " ";
    }
    std::cout << std::endl;

    std::array<float, 9> current_jpos_des = current_jpos;

    int phase_time = 500; // mill
    float phase_koef = 1.2f;

    unitree_go::msg::dds_::LowCmd_ msg;

    //start up
    {
        updateJointPositions(${blocks[0].duration}, init_pos, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 1);
    }

    phase_time = 1000; // в миллисек.

    {
${blocks.filter(b => !b.isSystem).map((block, index) => {
  const nonlinearity = block.nonlinearity === '' ? '1.0f' : 
    Number.isInteger(parseFloat(block.nonlinearity)) ? 
      `${block.nonlinearity}.0f` : 
      `${block.nonlinearity}f`;
  return `        updateJointPositions(${block.duration}, {${block.positions.map(formatPosition).join(', ')}}, current_jpos_des, ${nonlinearity}, msg, arm_joints, arm_sdk_publisher); // ${block.name}`;
}).join('\n')}
    }

    // shutdown
    {
        updateJointPositions(${blocks[blocks.length - 1].duration}, target_pos8, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 2);
    }
    
    std::cout << "Done!" << std::endl;

    return 0;
}`;

    return header;
  };

  // Обновляем обработчик изменений из 3D
  const handlePositionsFrom3D = (newPositions, isAnimation = false) => {
    // Если это анимация, только обновляем 3D модель
    if (isAnimation) {
      if (onPositionsChange) {
        onPositionsChange(newPositions, true);
      }
      return;
    }

    // Если это не анимация и нет активной анимации, обновляем блок
    if (!isAnimating && selectedBlockId) {
      updateBlock(selectedBlockId, 'positions', newPositions);
      setLocalPositionsMap(prev => ({
        ...prev,
        [selectedBlockId]: newPositions.reduce((acc, val, idx) => ({
          ...acc,
          [idx]: val === undefined ? '' : val
        }), {})
      }));
    }
  };

  // Обновляем useEffect для синхронизации с изменениями из 3D
  useEffect(() => {
    const selectedBlock = blocks.find(b => b.id === selectedBlockId);
    if (!selectedBlock || isAnimating) return;

    // Обновляем локальные позиции при изменении блока
    setLocalPositionsMap(prev => ({
      ...prev,
      [selectedBlockId]: selectedBlock.positions.reduce((acc, val, idx) => ({
        ...acc,
        [idx]: editingFields[selectedBlockId]?.[idx] ? prev[selectedBlockId]?.[idx] : (val === undefined ? '' : val)
      }), {})
    }));
  }, [blocks, selectedBlockId, isAnimating]);

  // Добавляем функцию для переключения состояния сворачивания
  const toggleCollapse = (blockId, e) => {
    e.stopPropagation();
    setCollapsedBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };

  const handleSaveAndGenerate = async () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const version = parseInt(hours + minutes);
    
    const code = generateCode();
    const codeWithVersion = code.replace('int version_debug = 1291;', `int version_debug = ${version};`);
    
    try {
      await onSave(filename, codeWithVersion);
      // Обновляем список файлов после успешного сохранения
      await loadValidFiles();
      // Показываем сообщение об успешном сохранении
      alert('Файл успешно сохранен');
    } catch (error) {
      console.error('Ошибка при сохранении файла:', error);
      alert('Ошибка при сохранении файла: ' + error.message);
    }
  };

  // Добавляем функцию для загрузки списка валидных файлов
  const loadValidFiles = async () => {
    try {
      const response = await fetch('/api/motion/valid-files');
      if (!response.ok) {
        throw new Error('Ошибка при загрузке списка файлов');
      }
      const data = await response.json();
      console.log('Загруженные файлы:', data.files); // Добавляем логирование
      setValidFiles(data.files);
    } catch (error) {
      console.error('Ошибка при загрузке списка файлов:', error);
    }
  };

  // Загружаем список файлов при монтировании компонента
  useEffect(() => {
    loadValidFiles();
  }, []);

  // Добавляем функцию для загрузки файла с компьютера
  const handleFileLoad = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      // Проверка на наличие функции updateJointPositions
      if (!content.includes('updateJointPositions')) {
        alert('Ошибка: в файле не найдена функция updateJointPositions!');
        return;
      }
      const newBlocks = analyzeMotionFile(content);
      if (newBlocks.length > 0) {
        // Полностью очищаем блоки и загружаем только новые из файла
        const initBlock = blocks.find(b => b.id === 'init') || INIT_BLOCK;
        const shutdownBlock = blocks.find(b => b.id === 'shutdown') || SHUTDOWN_BLOCK;
        const updatedBlocks = [
          initBlock,
          ...newBlocks,
          shutdownBlock
        ];
        setBlocks(updatedBlocks);
        // Выбираем первый несистемный блок
        const firstNonSystemBlock = newBlocks[0];
        if (firstNonSystemBlock) {
          setSelectedBlockId(firstNonSystemBlock.id);
        }
        // Обновляем имя файла
        setFilename(file.name);
      }
    };
    reader.readAsText(file);
  };

  // Новый обработчик выбора блока с пошаговой анимацией
  const handleSelectBlock = (targetId) => {
    if (isAnimating) return;
    const currentIdx = blocks.findIndex(b => b.id === selectedBlockId);
    const targetIdx = blocks.findIndex(b => b.id === targetId);
    if (currentIdx === -1 || targetIdx === -1 || currentIdx === targetIdx) return;
    // Формируем путь: массив индексов через которые нужно пройти
    const step = currentIdx < targetIdx ? 1 : -1;
    const path = [];
    for (let i = currentIdx + step; step > 0 ? i <= targetIdx : i >= targetIdx; i += step) {
      path.push(blocks[i].id);
    }
    if (path.length > 0) {
      setPendingPath(path);
      setSelectedBlockId(path[0]);
    }
  };

  // После завершения анимации к промежуточному блоку — идём дальше по пути
  useEffect(() => {
    if (!isAnimating && pendingPath.length > 1) {
      setPendingPath(path => {
        const nextPath = path.slice(1);
        if (nextPath.length > 0) {
          setTimeout(() => setSelectedBlockId(nextPath[0]), 0);
        }
        return nextPath;
      });
    }
    // Если путь опустел, но selectedBlockId не совпадает с последним выбранным, доанимировать последний блок
    if (!isAnimating && pendingPath.length === 1) {
      setTimeout(() => setSelectedBlockId(pendingPath[0]), 0);
      setPendingPath([]);
    }
  }, [isAnimating, pendingPath]);

  // Добавляем функцию для загрузки файла по имени
  const handleFileSelect = async (selectedFilename) => {
    if (!selectedFilename) return;
    
    try {
      console.log('Попытка загрузки файла:', selectedFilename); // Добавляем логирование
      // Проверяем, есть ли файл в списке валидных файлов
      if (!validFiles.includes(selectedFilename)) {
        throw new Error('Файл не найден в списке доступных файлов');
      }

      const response = await fetch(`/api/motions/${encodeURIComponent(selectedFilename)}`);
      if (!response.ok) {
        throw new Error(`Ошибка при загрузке файла: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log('Получено содержимое файла:', data); // Добавляем логирование
      
      // Проверяем наличие функции updateJointPositions
      if (!data.content.includes('updateJointPositions')) {
        alert('Ошибка: в файле не найдена функция updateJointPositions!');
        return;
      }

      const newBlocks = analyzeMotionFile(data.content);
      if (newBlocks.length > 0) {
        // Полностью очищаем блоки и загружаем только новые из файла
        const initBlock = blocks.find(b => b.id === 'init') || INIT_BLOCK;
        const shutdownBlock = blocks.find(b => b.id === 'shutdown') || SHUTDOWN_BLOCK;
        const updatedBlocks = [
          initBlock,
          ...newBlocks,
          shutdownBlock
        ];
        setBlocks(updatedBlocks);
        // Выбираем первый несистемный блок
        const firstNonSystemBlock = newBlocks[0];
        if (firstNonSystemBlock) {
          setSelectedBlockId(firstNonSystemBlock.id);
        }
        // Обновляем имя файла
        setFilename(selectedFilename);
      }
    } catch (error) {
      console.error('Ошибка при загрузке файла:', error);
      alert('Не удалось загрузить файл: ' + error.message);
    }
  };

  const renderBlock = (block, index) => (
    <MotionBlock
      key={block.id}
      block={block}
      index={index}
      isSystemBlock={block.isSystem}
      onMove={moveBlock}
      onUpdate={updateBlock}
      onSelect={handleSelectBlock}
      isSelected={selectedBlockId === block.id}
      isAnimating={isAnimating}
      collapsedBlocks={collapsedBlocks}
      onToggleCollapse={toggleCollapse}
      onDuplicate={duplicateBlock}
      onRemove={removeBlock}
      durationErrors={durationErrors}
      coefficientErrors={coefficientErrors}
      localPositionsMap={localPositionsMap}
      editingFields={editingFields}
      onMatrixCellChange={handleMatrixCellChange}
      onMatrixCellApply={handleMatrixCellApply}
      blocks={blocks}
      validateInput={validateInput}
    />
  );

    return (
      <div style={{ 
        display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      width: '100%', 
      background: 'linear-gradient(to bottom, #181c24, #1a1f2b)',
      ...dragStyles
    }}>
      {/* Верхняя панель */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: 12,
        borderBottom: '1px solid #334155', 
        padding: '12px 16px',
        background: 'linear-gradient(to bottom, #23272f, #1e293b)',
        position: 'relative',
        minHeight: 56,
        maxWidth: '100%',
        boxSizing: 'border-box',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
      }}>
        {/* Первая линия - имя файла */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8, 
          width: '100%',
          paddingRight: 24
        }}>
          <input
            type="text"
            value={filename}
            onChange={e => setFilename(e.target.value)}
            style={{ 
              flex: 1,
              background: 'linear-gradient(to bottom, #181c24, #1a1f2b)', 
              color: '#fff', 
                border: '1px solid #334155',
              borderRadius: 8, 
              padding: '8px 12px',
              fontSize: 14,
                fontWeight: 500,
                outline: 'none',
              transition: 'all 0.2s',
              boxSizing: 'border-box',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
              height: 40,
              '&:focus': {
                borderColor: '#2563eb',
                boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)'
              }
            }}
            placeholder="Введите имя файла"
          />
          {/* Кастомный dropdown */}
          <div
            ref={dropdownRef}
            style={{ 
              width: '50%',
              position: 'relative',
              userSelect: 'none',
              zIndex: 10
            }}
          >
            <div
              onClick={() => setDropdownOpen((open) => !open)}
              style={{
                background: 'linear-gradient(to bottom, #181c24, #1a1f2b)',
              color: '#fff', 
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '8px 32px 8px 12px',
                fontSize: 14,
              fontWeight: 500,
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s',
                boxSizing: 'border-box',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                minHeight: 40,
                height: 40
              }}
            >
              <span style={{flex: 1, color: selectedFile ? '#fff' : '#94a3b8'}}>
                {selectedFile || 'Уже существует'}
              </span>
              <svg style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none'}} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            {dropdownOpen && (
              <ul
                style={{
                  position: 'absolute',
                  top: '110%',
                  left: 0,
                  width: '100%',
                  background: 'linear-gradient(to bottom, #23272f, #1e293b)',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  maxHeight: 220,
                  overflowY: 'auto',
                  zIndex: 100,
                  animation: 'fadeIn 0.15s'
                }}
              >
                {validFiles.length === 0 && (
                  <li style={{padding: '10px 16px', color: '#94a3b8', fontSize: 14}}>Нет файлов</li>
                )}
              {validFiles.map(file => (
                  <li
                    key={file}
                    onClick={() => {
                      setSelectedFile(file);
                      setDropdownOpen(false);
                      handleFileSelect(file);
                    }}
                    style={{
                      padding: '10px 16px',
                      color: '#fff',
                      fontSize: 14,
                      cursor: 'pointer',
                      background: selectedFile === file ? 'rgba(37,99,235,0.12)' : 'none',
                      transition: 'background 0.15s',
                      borderBottom: '1px solid #23272f',
                      borderRadius: selectedFile === file ? 8 : 0
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = selectedFile === file ? 'rgba(37,99,235,0.12)' : 'none'}
                  >
                    {file}
                  </li>
              ))}
              </ul>
            )}
        </div>
        </div>

        {/* Вторая линия - кнопки */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          paddingRight: 24
        }}>
          {/* Кнопка загрузки файла */}
        <label style={{
            background: 'linear-gradient(to bottom, #334155, #1e293b)',
            color: '#fff', 
            border: 'none', 
            borderRadius: 8, 
            padding: '8px 16px',
            fontSize: 14,
          fontWeight: 600,
            cursor: 'pointer', 
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
            flex: '1 1 auto',
            '&:hover': {
              background: 'linear-gradient(to bottom, #475569, #334155)',
              transform: 'translateY(-1px)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }
        }}
          title="Загрузить файл с движениями (.cpp)"
        >
                          <input
            type="file"
            accept=".cpp"
            onChange={handleFileLoad}
            style={{ display: 'none' }}
                          />
            <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Загрузить
                            </label>

        {/* Кнопка добавить движение */}
                              <button 
          onClick={addBlock} 
                                style={{ 
              background: 'linear-gradient(to bottom, #2563eb, #1d4ed8)', 
            color: '#fff', 
                                  border: 'none', 
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
          fontWeight: 600,
            cursor: 'pointer', 
                                  display: 'flex',
                                  alignItems: 'center',
              gap: 8,
              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
              transition: 'all 0.2s',
              flex: '1 1 auto',
              '&:hover': {
                background: 'linear-gradient(to bottom, #1d4ed8, #1e40af)',
                transform: 'translateY(-1px)',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)'
              }
        }}
        title="Добавить новое движение"
                              >
            <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
        Новое
                              </button>

          {/* Кнопка сохранить */}
                              <button 
          onClick={handleSaveAndGenerate}
                                style={{ 
              background: 'linear-gradient(to bottom, #059669, #047857)', 
            color: '#fff', 
                                  border: 'none', 
              borderRadius: 8, 
              padding: '8px 16px',
              fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer', 
                                  display: 'flex',
                                  alignItems: 'center',
              gap: 8,
              boxShadow: '0 1px 2px rgba(5, 150, 105, 0.2)',
              flex: '1 1 auto',
              transition: 'all 0.2s',
              '&:hover': {
                background: 'linear-gradient(to bottom, #047857, #065f46)',
                transform: 'translateY(-1px)',
                boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)'
              }
          }}
          title="Сохранить и сгенерировать код"
                              >
            <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
                                </svg>
          Сохранить
                              </button>
        </div>
                        </div>

      {/* Список движений */}
                          <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '20px 24px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        ...dragStyles
      }}>
        {blocks.map((block, index) => renderBlock(block, index))}
      </div>

      {/* Индикатор анимации */}
      {isAnimating && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'linear-gradient(to bottom, #2563eb, #1d4ed8)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: 8,
          zIndex: 1000,
          fontSize: 14,
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
          backdropFilter: 'blur(8px)',
          animation: 'slideUp 0.3s ease-out'
        }}>
          Анимация движения...
        </div>
      )}

      <style>
        {`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
};

export default MotionEditor; 