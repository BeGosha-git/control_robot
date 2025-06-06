import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import RobotViewer from '../components/RobotViewer';
import MotionEditor, { analyzeMotionFile } from '../components/MotionEditor';
import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import { AnimationProvider, useAnimation } from '../context/AnimationContext';

// Вспомогательная функция для работы с путями в браузере
const joinPaths = (...parts) => {
  return parts
    .map(part => part.replace(/^[\/\\]+|[\/\\]+$/g, '')) // Убираем начальные и конечные слеши
    .filter(Boolean) // Убираем пустые части
    .join('/'); // Соединяем через прямой слеш
};

const defaultBlock = () => ({
  id: Date.now().toString(),
  name: 'Движение 1',
  code: `updateJointPositions(1000, target_pos, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher);`,
  duration: 1000,
  positions: Array(9).fill(0),
  group: 'Основные',
  nonlinearity: 1.0,
  isSystem: false
});

const INIT_BLOCK = {
  id: 'init',
  name: 'Инициализация',
  code: `updateJointPositions(500, init_pos, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 1);`,
  duration: 500,
  positions: [0.29, 0, 0, 0.1, 0.29, 0, 0, 0.1, 0],
  group: 'Системные',
  nonlinearity: 1.2,
  isSystem: true
};

const SHUTDOWN_BLOCK = {
  id: 'shutdown',
  name: 'Завершение',
  code: `updateJointPositions(400, target_pos8, current_jpos_des, phase_koef, msg, arm_joints, arm_sdk_publisher, 2);`,
  duration: 400,
  positions: [0.39, 0, 0, 0.1, 0.39, 0, 0, 0.1, 0],
  group: 'Системные',
  nonlinearity: 1.2,
  isSystem: true
};

const MotionCreator = () => {
  const [searchParams] = useSearchParams();
  const [blocks, setBlocks] = useState([INIT_BLOCK, defaultBlock(), SHUTDOWN_BLOCK]);
  const [selectedBlockId, setSelectedBlockId] = useState(defaultBlock().id);
  const { jointPositions, animateTo, animateSequence, setPositionsInstant, isAnimating } = useAnimation();
  const [robotInstance, setRobotInstance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);
  const robotRef = useRef(null);
  const [lastBlockId, setLastBlockId] = useState(selectedBlockId);

  // Функция для загрузки файла
  const loadFile = async (filename) => {
    try {
      const response = await fetch(`/api/motion/${filename}`);
      if (!response.ok) {
        throw new Error('Ошибка при загрузке файла');
      }
      const data = await response.json();
      
      // Анализируем содержимое файла и создаем блоки
      const motionBlocks = analyzeMotionFile(data.content);
      if (motionBlocks.length > 0) {
        // Добавляем системные блоки в начало и конец
        setBlocks([INIT_BLOCK, ...motionBlocks, SHUTDOWN_BLOCK]);
        // Выбираем первый пользовательский блок
        setSelectedBlockId(motionBlocks[0].id);
      }
    } catch (error) {
      console.error('Ошибка при загрузке файла:', error);
      setError('Не удалось загрузить файл: ' + error.message);
    }
  };

  // Обработка query-параметров при монтировании компонента
  useEffect(() => {
    const fileParam = searchParams.get('file');
    const importParam = searchParams.get('import');
    
    if (importParam) {
      // Загружаем файл из дерева файлов
      fetch(`/api/fs/content?path=${encodeURIComponent(importParam)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Ошибка при загрузке файла');
          }
          return response.json();
        })
        .then(data => {
          // Анализируем содержимое файла и создаем блоки
          const motionBlocks = analyzeMotionFile(data.content);
          if (motionBlocks.length > 0) {
            // Добавляем системные блоки в начало и конец
            setBlocks([INIT_BLOCK, ...motionBlocks, SHUTDOWN_BLOCK]);
            // Выбираем первый пользовательский блок
            setSelectedBlockId(motionBlocks[0].id);
          }
        })
        .catch(error => {
          console.error('Ошибка при загрузке файла:', error);
          setError('Не удалось загрузить файл: ' + error.message);
        });
    } else if (fileParam) {
      loadFile(fileParam);
    }
  }, [searchParams]);

  // Анимация при смене блока
  useEffect(() => {
    if (lastBlockId === selectedBlockId) return;
    const currentIdx = blocks.findIndex(b => b.id === lastBlockId);
    const targetIdx = blocks.findIndex(b => b.id === selectedBlockId);
    if (currentIdx === -1 || targetIdx === -1 || currentIdx === targetIdx) {
      setLastBlockId(selectedBlockId);
      return;
    }
    // Формируем путь: массив позиций через которые нужно пройти (всегда по актуальному blocks)
    const step = currentIdx < targetIdx ? 1 : -1;
    const path = [];
    const durations = [];
    for (let i = currentIdx + step; step > 0 ? i <= targetIdx : i >= targetIdx; i += step) {
      const block = blocks[i];
      path.push(block.positions);
      durations.push(block.duration || 500);
    }
    if (path.length > 0) {
      animateSequence(path, durations, () => setLastBlockId(selectedBlockId));
      } else {
      setLastBlockId(selectedBlockId);
      }
  }, [selectedBlockId, blocks, lastBlockId, animateSequence]);

  // Обработчик изменения позиций из полей матрицы
  const handleMatrixPositionsChange = (newPositions) => {
    setBlocks(blocks => blocks.map(block =>
      block.id === selectedBlockId ? { ...block, positions: [...newPositions] } : block
    ));
  };

  // Обработчик изменения позиций из 3D-визуализации (drag цилиндра)
  const handlePositionsFrom3D = (newPositions) => {
    setBlocks(blocks => blocks.map(block =>
      block.id === selectedBlockId ? { ...block, positions: [...newPositions] } : block
    ));
    setPositionsInstant(newPositions);
  };

  // Инициализация сцены и загрузка URDF
  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Загрузка URDF через urdf-loader
    const loader = new URDFLoader();
    loader.packages = {
      h1_description: '/models/h1',
    };
    loader.loadMeshCb = (path, manager, done) => {
      let cleanPath = path.replace('/urdf/', '/').replace(/\.stl$/i, '.dae');
      cleanPath = cleanPath.replace(/\/{2,}/g, '/');
      if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
      loader.defaultMeshLoader(cleanPath, manager, done);
    };

    loader.load('/urdf/h1.urdf', (urdfRobot) => {
      robotRef.current = urdfRobot;
      setRobotInstance(urdfRobot);
      urdfRobot.rotation.x = -Math.PI / 2;
      urdfRobot.position.set(-0.1, -0.25, 0);
      scene.add(urdfRobot);
      setIsLoading(false);
    }, undefined, (err) => {
      setError('Ошибка загрузки URDF: ' + err.message);
      console.error('Ошибка загрузки URDF:', err);
      setIsLoading(false);
    });

    return () => {
      if (robotRef.current) {
        scene.remove(robotRef.current);
        robotRef.current = null;
      }
    };
  }, []);

  const handleSave = async (filename, code) => {
    try {
      const response = await fetch('/api/motion/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename,
          content: code 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Ошибка при сохранении файла');
      }

      await response.json();
      alert('Файл успешно сохранен!');
    } catch (error) {
      console.error('Ошибка при сохранении файла:', error);
      alert('Произошла ошибка при сохранении файла: ' + error.message);
    }
  };

  const parseValue = (value) => {
    value = value.trim();
    value = value.replace(/[};]+$/, '').trim();
    value = value.replace(/\s+/g, '');
    // Используем улучшенную регулярку для разбора выражения
    const parts = value.match(/([+-]?[^+-][^+-]*)/g);
    if (parts && parts.length > 1) {
      let result = parseSingle(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        result += parseSingle(parts[i]);
      }
      return result;
    }
    return parseSingle(value);
  };

  const parseSingle = (val) => {
    val = val.trim();
    if (val === 'kPi') return Math.PI;
    if (val === 'kPi_2') return Math.PI / 2;
    if (val.endsWith('f')) {
      return parseFloat(val.slice(0, -1));
    }
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Левая панель с 3D-визуализацией */}
      <div style={{ flex: '0 0 55vw', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
          {isLoading && (
            <div style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)',
              color: '#fff',
              fontSize: '1.2rem',
              zIndex: 10
            }}>
              Загрузка модели робота...
            </div>
          )}
          {error && (
            <div style={{ 
              position: 'absolute', 
              top: 20, 
              left: 20, 
              color: '#ef4444',
              backgroundColor: 'rgba(0,0,0,0.7)',
              padding: '8px 16px',
              borderRadius: '4px',
              zIndex: 10
            }}>
              {error}
            </div>
          )}
          <RobotViewer 
            jointPositions={jointPositions} 
            onJointChange={setPositionsInstant}
            robotInstance={robotInstance}
            scene={sceneRef.current}
            selectedBlockId={selectedBlockId}
            onPositionsFrom3D={handlePositionsFrom3D}
          />
        </div>
      </div>

      {/* Правая панель с редактором движений */}
      <div style={{ flex: 1, background: '#18181b', display: 'flex', flexDirection: 'column', borderLeft: '2px solid #222', minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, color: '#fff', paddingBottom: '8vh' }}>
          <MotionEditor 
            onSave={handleSave} 
            onPositionsChange={handleMatrixPositionsChange}
            blocks={blocks}
            setBlocks={setBlocks}
            selectedBlockId={selectedBlockId}
            setSelectedBlockId={setSelectedBlockId}
          />
        </div>
      </div>
    </div>
  );
};

const MotionCreatorWithProvider = () => (
  <AnimationProvider>
    <MotionCreator />
  </AnimationProvider>
);

export default MotionCreatorWithProvider; 