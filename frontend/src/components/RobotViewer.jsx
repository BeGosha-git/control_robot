import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Константы для проверки столкновений плеч
const SHOULDER_COLLISION_MARGIN = 0.02; // Дополнительный отступ для визуализации
const SHOULDER_LINKS = {
  left: 'left_shoulder_yaw_link',
  right: 'right_shoulder_yaw_link'
};

const handleJoints = [
  'left_shoulder_pitch_joint',
  'left_shoulder_roll_joint',
  'left_shoulder_yaw_joint',
  'left_elbow_joint',
  'right_shoulder_pitch_joint',
  'right_shoulder_roll_joint',
  'right_shoulder_yaw_joint',
  'right_elbow_joint',
  'torso_joint',
];

// Оси вращения для суставов (локально для каждого сустава)
const jointArrowDirections = {
  left_shoulder_pitch_joint: new THREE.Vector3(0, 0, 1),  // Z
  left_shoulder_roll_joint: new THREE.Vector3(1, 0, 0),   // X
  left_shoulder_yaw_joint: new THREE.Vector3(0, 1, 0),    // Y
  left_elbow_joint: new THREE.Vector3(0, 0, 1),           // Z (горизонтально, поперёк тела)
  right_shoulder_pitch_joint: new THREE.Vector3(0, 0, 1), // Z
  right_shoulder_roll_joint: new THREE.Vector3(1, 0, 0),  // X
  right_shoulder_yaw_joint: new THREE.Vector3(0, 1, 0),   // Y
  right_elbow_joint: new THREE.Vector3(0, 0, 1),          // Z (горизонтально, поперёк тела)
  torso_joint: new THREE.Vector3(0, 1, 0),                // Y (вертикальная ось для торса)
};

// Оси для цилиндров и стрелок
const handleDirections = {
  left_shoulder_pitch_joint: new THREE.Vector3(0, 0, 1),  // Z
  left_shoulder_roll_joint: new THREE.Vector3(1, 0, 0),   // X
  left_shoulder_yaw_joint: new THREE.Vector3(0, 1, 0),    // Y
  left_elbow_joint: new THREE.Vector3(0, 0, 1),           // Z (горизонтально, поперёк тела)
  right_shoulder_pitch_joint: new THREE.Vector3(0, 0, 1), // Z
  right_shoulder_roll_joint: new THREE.Vector3(1, 0, 0),  // X
  right_shoulder_yaw_joint: new THREE.Vector3(0, 1, 0),   // Y
  right_elbow_joint: new THREE.Vector3(0, 0, 1),          // Z (горизонтально, поперёк тела)
  torso_joint: new THREE.Vector3(0, 1, 0),                // Y (вертикальная ось для торса)
};

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

// --- Вспомогательная функция для лимитирования ---
function clampJointValue(idx, value) {
  const lim = JOINT_LIMITS[idx] || { min: -10, max: 10 };
  return Math.max(lim.min, Math.min(lim.max, value));
}

// --- Ограничение FPS ---
const TARGET_FPS = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;

// --- Иерархия суставов для прозрачности ---
const jointHierarchy = {
  left_shoulder_pitch_joint: ['left_shoulder_roll_joint'],
  left_shoulder_roll_joint: ['left_shoulder_yaw_joint'],
  left_shoulder_yaw_joint: ['left_elbow_joint'],
  left_elbow_joint: [],
  right_shoulder_pitch_joint: ['right_shoulder_roll_joint'],
  right_shoulder_roll_joint: ['right_shoulder_yaw_joint'],
  right_shoulder_yaw_joint: ['right_elbow_joint'],
  right_elbow_joint: [],
  torso_joint: ['left_shoulder_pitch_joint', 'right_shoulder_pitch_joint'], // Торс является родителем для плеч
};

// --- Вспомогательная функция для получения визуальной оси с учётом поворота ---
const getVisualAxis = (name) => {
  let axis = handleDirections[name] ? handleDirections[name].clone().normalize() : new THREE.Vector3(0, 1, 0);
  if (
    name === 'left_shoulder_pitch_joint' ||
    name === 'right_shoulder_pitch_joint' ||
    name === 'left_shoulder_yaw_joint' ||
    name === 'right_shoulder_yaw_joint' ||
    name === 'left_elbow_joint' ||
    name === 'right_elbow_joint' ||
    name === 'torso_joint' // Добавляем торс в список суставов, требующих поворота оси
  ) {
    axis.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  }
  return axis;
};

// Иерархия суставов для проверки родительских связей
const LINK_HIERARCHY = {
  // Туловище и торс
  'pelvis': ['torso_link', 'left_hip_yaw_link', 'right_hip_yaw_link'],
  'torso_link': ['left_shoulder_pitch_link', 'right_shoulder_pitch_link'],

  // Левая рука
  'left_shoulder_pitch_link': ['left_shoulder_roll_link'],
  'left_shoulder_roll_link': ['left_shoulder_yaw_link'],
  'left_shoulder_yaw_link': ['left_elbow_link'],
  'left_elbow_link': ['left_hand_link'],

  // Правая рука
  'right_shoulder_pitch_link': ['right_shoulder_roll_link'],
  'right_shoulder_roll_link': ['right_shoulder_yaw_link'],
  'right_shoulder_yaw_link': ['right_elbow_link'],
  'right_elbow_link': ['right_hand_link'],

  // Левая нога
  'left_hip_yaw_link': ['left_hip_roll_link'],
  'left_hip_roll_link': ['left_hip_pitch_link'],
  'left_hip_pitch_link': ['left_knee_link'],
  'left_knee_link': ['left_ankle_link'],

  // Правая нога
  'right_hip_yaw_link': ['right_hip_roll_link'],
  'right_hip_roll_link': ['right_hip_pitch_link'],
  'right_hip_pitch_link': ['right_knee_link'],
  'right_knee_link': ['right_ankle_link'],
};

// Функция проверки, является ли один сустав родителем другого
const isParentJoint = (parentName, childName) => {
  if (!parentName || !childName) return false;
  if (parentName === childName) return true;
  
  const children = LINK_HIERARCHY[parentName];
  if (!children) return false;
  
  if (children.includes(childName)) return true;
  
  // Рекурсивно проверяем всех детей
  return children.some(child => isParentJoint(child, childName));
};

// Проверка прямого родителя/ребёнка
const isDirectParentOrChild = (a, b) => {
  return (LINK_HIERARCHY[a] && LINK_HIERARCHY[a].includes(b)) ||
         (LINK_HIERARCHY[b] && LINK_HIERARCHY[b].includes(a));
};

const RobotViewer = ({ jointPositions, onJointChange, robotInstance, scene, onMatrixChange, selectedBlockId, onAnimate, onPositionsFrom3D }) => {
  const mountRef = useRef();
  const [selectedJoint, setSelectedJoint] = useState(null);
  const [dragStartY, setDragStartY] = useState(null);
  const [dragStartValue, setDragStartValue] = useState(null);
  const [showArrows, setShowArrows] = useState(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const handlesGroupRef = useRef(null);
  const arrowPosRef = useRef();
  const arrowNegRef = useRef();
  const isDraggingArrowRef = useRef(false);
  const draggingArrowRef = useRef(null);
  const dragArrowOriginYRef = useRef(null);
  const dragArrowOriginValueRef = useRef(null);
  const isDraggingHandleRef = useRef(false);
  const draggingIdxRef = useRef(null);
  const dragOriginYRef = useRef(null);
  const dragOriginValueRef = useRef(null);
  const dragArrowOriginAngleRef = useRef(null);
  const lastArrowValueRef = useRef(Array(9).fill(null));
  const handlesRefs = useRef([]);
  const arcGroupRef = useRef(null);
  const arcRef = useRef(null);
  const sectorRef = useRef(null);
  const lastCameraState = useRef({ position: null, rotation: null });
  const collisionSpheresRef = useRef({});
  const collisionMaterialRef = useRef(null);
  const shoulderBoxesRef = useRef({});

  // Маппинг имён суставов URDF к индексам массива (строго по arm_joints)
  const jointNames = [
    'left_shoulder_pitch_joint',
    'left_shoulder_roll_joint',
    'left_shoulder_yaw_joint',
    'left_elbow_joint',
    'right_shoulder_pitch_joint',
    'right_shoulder_roll_joint',
    'right_shoulder_yaw_joint',
    'right_elbow_joint',
    'torso_joint',
  ];

  // Добавляем эффект для отслеживания видимости компонента
  useEffect(() => {
    if (!mountRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(mountRef.current);

    return () => {
      if (mountRef.current) {
        observer.unobserve(mountRef.current);
      }
    };
  }, []);

  // Добавляем эффект для отслеживания готовности модели
  useEffect(() => {
    if (!robotInstance || !scene) {
      setIsModelReady(false);
      setLoadingProgress(0);
      return;
    }

    let progress = 0;
    let checkAttempts = 0;
    const maxAttempts = 50; // Максимальное количество попыток проверки (5 секунд)
    let isInitialCheck = true; // Флаг для первой проверки

    const checkModelReady = () => {
      checkAttempts++;
      
      // Проверяем наличие и состояние всех необходимых компонентов
      const hasJoints = robotInstance.joints && 
        Object.keys(robotInstance.joints).length === jointNames.length &&
        jointNames.every(name => robotInstance.joints[name] && 
          typeof robotInstance.joints[name].getJointValue === 'function');

      const hasMeshes = scene.children.some(child => child.isMesh) &&
        scene.children.some(child => child.name && child.name.includes('_link'));

      const hasHandles = handlesGroupRef.current && 
        handlesGroupRef.current.children.length === handleJoints.length &&
        handlesRefs.current.length === handleJoints.length;

      const hasRenderer = rendererRef.current && 
        rendererRef.current.domElement &&
        rendererRef.current.domElement.parentNode === mountRef.current;

      const hasCamera = cameraRef.current && 
        cameraRef.current.position &&
        cameraRef.current.rotation;

      const hasControls = controlsRef.current && 
        controlsRef.current.enabled !== undefined;

      // Проверяем значения суставов только при первой загрузке
      const hasValidJointValues = isInitialCheck ? 
        jointPositions.every((pos, idx) => {
          const joint = robotInstance.joints[jointNames[idx]];
          return joint && typeof pos === 'number' && !isNaN(pos) && 
                 pos >= JOINT_LIMITS[idx].min && pos <= JOINT_LIMITS[idx].max;
        }) : true;

      // Вычисляем прогресс с учетом всех компонентов
      const components = [
        hasJoints,
        hasMeshes,
        hasHandles,
        hasRenderer,
        hasCamera,
        hasControls,
        hasValidJointValues
      ];
      
      progress = Math.round((components.filter(Boolean).length / components.length) * 100);
      setLoadingProgress(progress);

      // Проверяем готовность модели
      if (progress === 100) {
        // Даем небольшую задержку для уверенности, что все обновилось
        setTimeout(() => {
          setIsModelReady(true);
          isInitialCheck = false; // Отключаем проверку значений суставов
          // Принудительно запрашиваем рендер
          if (rendererRef.current && scene && cameraRef.current) {
            rendererRef.current.render(scene, cameraRef.current);
          }
        }, 100);
      } else if (checkAttempts < maxAttempts) {
        // Проверяем снова через небольшую задержку
        setTimeout(checkModelReady, 100);
      } else {
        // Если превышено максимальное количество попыток, все равно показываем модель
        console.warn('Превышено время ожидания полной загрузки модели');
        setIsModelReady(true);
        isInitialCheck = false; // Отключаем проверку значений суставов
      }
    };

    checkModelReady();

    return () => {
      setIsModelReady(false);
      setLoadingProgress(0);
    };
  }, [robotInstance, scene]);

  // Добавляем эффект для принудительного рендера при изменении готовности модели
  useEffect(() => {
    if (isModelReady && rendererRef.current && scene && cameraRef.current) {
      // Принудительно рендерим несколько кадров для уверенности
      const renderFrames = () => {
        for (let i = 0; i < 3; i++) {
          rendererRef.current.render(scene, cameraRef.current);
        }
      };
      renderFrames();
      // Дополнительный рендер через небольшую задержку
      setTimeout(renderFrames, 100);
    }
  }, [isModelReady, scene]);

  // --- Новый подход: всё создаётся один раз, управление только через свойства ---
  useEffect(() => {
    if (!scene || !robotInstance) return;
    // Создаём группу для всех объектов (ручки, дуга, сектор)
    if (!handlesGroupRef.current) {
      handlesGroupRef.current = new THREE.Group();
      handlesGroupRef.current.name = 'handlesGroup';
      scene.add(handlesGroupRef.current);
      console.log('handlesGroup создан и добавлен в сцену');
    }
    // --- Цилиндры-ручки ---
    if (handlesRefs.current.length === 0) {
      handleJoints.forEach((name, idx) => {
        const joint = robotInstance.joints[name];
        if (joint) {
          const axis = getVisualAxis(name);
          const length = 0.08;
          const radius = 0.015;
          const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
          const material = new THREE.MeshPhongMaterial({ 
            color: 0x2196f3, 
            transparent: true, 
            opacity: 0.15, 
            emissive: 0x2196f3,
            emissiveIntensity: 0.3,
            depthTest: false,
            depthWrite: false
          });
          const cylinder = new THREE.Mesh(geometry, material);
          cylinder.name = 'handle_' + name;
          cylinder.userData.jointIdx = idx;
          cylinder.renderOrder = 999;
          handlesGroupRef.current.add(cylinder);
          handlesRefs.current.push(cylinder);
        }
      });
      console.log('Цилиндры-ручки созданы:', handlesRefs.current.length);
    }
    // --- Дуга и сектор ---
    if (!arcGroupRef.current) {
      const arcRadius = 0.13;
      const arcThickness = 0.012;
      const arcAngle = Math.PI * 2 / 3;
      const arcSegments = 12;
      const arcGeometry = new THREE.TorusGeometry(arcRadius, arcThickness, 6, arcSegments, arcAngle);
      arcGeometry.rotateX(Math.PI / 2);
      const arcMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2196f3, 
        transparent: true, 
        opacity: 0.92, 
        emissive: 0x2196f3, 
        emissiveIntensity: 0.3, 
        depthTest: false, 
        depthWrite: false
      });
      const arc = new THREE.Mesh(arcGeometry, arcMaterial);
      arcRef.current = arc;
      const sectorGeometry = new THREE.RingGeometry(
        0,
        arcRadius + arcThickness * 2,
        arcSegments,
        1,
        0,
        arcAngle
      );
      sectorGeometry.rotateX(Math.PI / 2);
      const sectorMaterial = new THREE.MeshPhongMaterial({
        color: 0x2196f3,
        transparent: true,
        opacity: 0.15,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const sector = new THREE.Mesh(sectorGeometry, sectorMaterial);
      sectorRef.current = sector;
      const arcGroup = new THREE.Group();
      arcGroup.name = 'arrow_rot';
      arcGroup.renderOrder = 999;
      arcGroup.visible = false;
      arcGroup.add(arc);
      arcGroup.add(sector);
      arcGroupRef.current = arcGroup;
      handlesGroupRef.current.add(arcGroup);
      console.log('Дуга и сектор созданы');
    }
    // Очистка при размонтировании
    return () => {
      if (scene && handlesGroupRef.current) {
        handlesGroupRef.current.children.forEach(obj => {
          if (obj.parent) obj.parent.remove(obj);
        });
        scene.remove(handlesGroupRef.current);
      }
      // Откладываем dispose на следующий кадр
      const cylinders = handlesRefs.current.slice();
      const arc = arcRef.current;
      const sector = sectorRef.current;
      requestAnimationFrame(() => {
        cylinders.forEach(obj => {
          if (obj.geometry) try { obj.geometry.dispose(); } catch {}
          if (obj.material) try { obj.material.dispose(); } catch {}
        });
        if (arc) {
          if (arc.geometry) try { arc.geometry.dispose(); } catch {}
          if (arc.material) try { arc.material.dispose(); } catch {}
        }
        if (sector) {
          if (sector.geometry) try { sector.geometry.dispose(); } catch {}
          if (sector.material) try { sector.material.dispose(); } catch {}
        }
      });
      handlesRefs.current = [];
      arcRef.current = null;
      sectorRef.current = null;
      arcGroupRef.current = null;
      handlesGroupRef.current = null;
    };
  }, [scene, robotInstance]);

  // Модифицируем эффект инициализации мешей плеч
  useEffect(() => {
    if (!scene || !robotInstance || !isVisible) return;
    
    // Создаем материал для сфер столкновений
    collisionMaterialRef.current = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.6,
      emissive: 0xff0000,
      emissiveIntensity: 0.3
    });

    // Создаем сферы для каждого плеча
    Object.values(SHOULDER_LINKS).forEach(shoulderName => {
      const geometry = new THREE.SphereGeometry(0.09, 16, 16);
      const sphere = new THREE.Mesh(geometry, collisionMaterialRef.current);
      sphere.visible = false;
      sphere.name = `collision_${shoulderName}`;
      scene.add(sphere);
      collisionSpheresRef.current[shoulderName] = sphere;
    });

    let initAttempts = 0;
    const maxAttempts = 5;

    // Инициализируем боксы после полной загрузки модели
    const initShoulderBoxes = () => {
      if (!isVisible) return; // Прерываем инициализацию, если компонент не виден

      // Получаем меши плеч из сцены
      scene.traverse((object) => {
        if (object.isMesh) {
          if (object.name.includes('left_shoulder_yaw_link') && !object.name.startsWith('collision_')) {
            const box = new THREE.Box3().setFromObject(object);
            shoulderBoxesRef.current[SHOULDER_LINKS.left] = {
              box,
              mesh: object
            };
            console.log('Найден меш левого плеча:', object.name);
          }
          if (object.name.includes('right_shoulder_yaw_link') && !object.name.startsWith('collision_')) {
            const box = new THREE.Box3().setFromObject(object);
            shoulderBoxesRef.current[SHOULDER_LINKS.right] = {
              box,
              mesh: object
            };
            console.log('Найден меш правого плеча:', object.name);
          }
        }
      });

      // Проверяем, что оба меша найдены
      if (!shoulderBoxesRef.current[SHOULDER_LINKS.left] || !shoulderBoxesRef.current[SHOULDER_LINKS.right]) {
        if (initAttempts < maxAttempts) {
        console.warn('Не все меши плеч найдены, пробуем еще раз...');
          initAttempts++;
        setTimeout(initShoulderBoxes, 1000);
        } else {
          console.warn('Превышено максимальное количество попыток инициализации мешей плеч');
        }
      } else {
        console.log('Оба меша плеч успешно найдены и инициализированы');
      }
    };

    // Запускаем инициализацию только если компонент виден
    if (isVisible) {
    initShoulderBoxes();
    }

    return () => {
      Object.values(collisionSpheresRef.current).forEach(sphere => {
        if (sphere.parent) sphere.parent.remove(sphere);
        if (sphere.geometry) sphere.geometry.dispose();
      });
      if (collisionMaterialRef.current) {
        collisionMaterialRef.current.dispose();
      }
      collisionSpheresRef.current = {};
      shoulderBoxesRef.current = {};
    };
  }, [scene, robotInstance, isVisible]);

  // --- Проверка коллизий только для линков (имя заканчивается на '_link') ---
  const checkAllCollisions = () => {
    if (!scene) return;
    // Находим все нужные меши (имя заканчивается на '_link', не collision_)
    const foundMeshes = [];
    scene.traverse(obj => {
      if (obj.isMesh && obj.name.endsWith('_link') && !obj.name.startsWith('collision_')) {
        foundMeshes.push(obj);
      }
    });
    // Для каждой уникальной пары
    for (let i = 0; i < foundMeshes.length; i++) {
      for (let j = i + 1; j < foundMeshes.length; j++) {
        const meshA = foundMeshes[i];
        const meshB = foundMeshes[j];
        if (meshA === meshB) continue;
        if (isDirectParentOrChild(meshA.name, meshB.name)) continue;
        const boxA = new THREE.Box3().setFromObject(meshA);
        const boxB = new THREE.Box3().setFromObject(meshB);
        if (boxA.intersectsBox(boxB)) {
          // --- Уменьшаем чувствительность: проверяем объём пересечения ---
          const intersectionBox = boxA.clone().intersect(boxB);
          const intersectionSize = new THREE.Vector3();
          intersectionBox.getSize(intersectionSize);
          // Если объём пересечения слишком мал — не считаем коллизией
          if (intersectionSize.x < 0.01 && intersectionSize.y < 0.01 && intersectionSize.z < 0.01) continue;

          const aSurface = boxA.clampPoint(boxB.getCenter(new THREE.Vector3()), new THREE.Vector3());
          const bSurface = boxB.clampPoint(boxA.getCenter(new THREE.Vector3()), new THREE.Vector3());
          const contactPoint = aSurface.clone().add(bSurface).multiplyScalar(0.5);
          // Логируем имена
          if (meshA.name === 'torso_link' || meshB.name === 'torso_link') {
            const other = meshA.name === 'torso_link' ? meshB.name : meshA.name;
            console.log(`Пересечение: торс и ${other}`);
          } else {
            console.log(`Пересекаются: ${meshA.name} и ${meshB.name}`);
          }
          // Визуализируем шар в точке соприкосновения
          let sphere = collisionSpheresRef.current[`${meshA.name}_${meshB.name}`];
          if (!sphere) {
            const geometry = new THREE.SphereGeometry(0.02, 16, 16); // Уменьшенный радиус до 0.02
            const material = new THREE.MeshPhongMaterial({ 
              color: 0xff2222, 
              transparent: true, 
              opacity: 0.7, // Увеличиваем непрозрачность для лучшей видимости
              emissive: 0xff2222,
              emissiveIntensity: 0.5 // Добавляем свечение для лучшей видаимости
            });
            sphere = new THREE.Mesh(geometry, material);
            sphere.name = `collision_${meshA.name}_${meshB.name}`;
            scene.add(sphere);
            collisionSpheresRef.current[`${meshA.name}_${meshB.name}`] = sphere;
          }
          sphere.position.copy(contactPoint);
          sphere.visible = true;
          // Устанавливаем фиксированный размер
          sphere.scale.set(1, 1, 1);
          if (sphere.material) {
            sphere.material.opacity = 0.7;
            sphere.material.transparent = true;
            sphere.material.needsUpdate = true;
          }
        } else {
          const key = `${meshA.name}_${meshB.name}`;
          if (collisionSpheresRef.current[key]) {
            collisionSpheresRef.current[key].visible = false;
          }
        }
      }
    }
  };

  // --- Управление позициями, ориентацией и видимостью ---
  useEffect(() => {
    if (!robotInstance) return;
    // Обновляем позиции суставов
    jointNames.forEach((name, idx) => {
      if (robotInstance.joints && robotInstance.joints[name] && typeof jointPositions[idx] === 'number') {
        robotInstance.joints[name].setJointValue(Number(jointPositions[idx]));
      }
    });
    // Обновляем позиции цилиндров
    handleJoints.forEach((name, idx) => {
      const joint = robotInstance.joints[name];
      const cylinder = handlesRefs.current[idx];
      if (joint && cylinder) {
        joint.updateMatrixWorld(true);
        const worldQuat = new THREE.Quaternion();
        joint.getWorldQuaternion(worldQuat);
        const localAxis = getVisualAxis(name);
        const worldAxis = localAxis.clone().applyQuaternion(worldQuat);
        const cylinderQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), worldAxis);
        const worldPos = new THREE.Vector3();
        joint.getWorldPosition(worldPos);
        cylinder.position.copy(worldPos);
        cylinder.quaternion.copy(cylinderQuat);
        cylinder.updateMatrixWorld(true);
      }
    });

    // --- Динамическая ориентация дуги/сектора ---
    if (arcGroupRef.current && typeof showArrows === 'number' && showArrows >= 0) {
      const jointName = handleJoints[showArrows];
      const joint = robotInstance.joints[jointName];
      if (joint) {
        joint.updateMatrixWorld(true);
        const worldQuat = new THREE.Quaternion();
        joint.getWorldQuaternion(worldQuat);
        const localAxis = getVisualAxis(jointName);
        const worldAxis = localAxis.clone().applyQuaternion(worldQuat);
        const arcQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), worldAxis);
        const worldPos = new THREE.Vector3();
        joint.getWorldPosition(worldPos);
        arcGroupRef.current.position.copy(worldPos);
        arcGroupRef.current.quaternion.copy(arcQuat);

        // --- Дополнительные визуальные повороты для конкретных суставов ---
        if (jointName === 'left_shoulder_pitch_joint') {
          arcGroupRef.current.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI*2/3));
        } else if (jointName === 'left_shoulder_roll_joint') {
          arcGroupRef.current.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI));
          arcGroupRef.current.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI));
        } else if (jointName === 'left_shoulder_yaw_joint') {
          arcGroupRef.current.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI*2/3));
        } else if (jointName === 'right_shoulder_roll_joint') {
          arcGroupRef.current.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI));
        } else if (jointName === 'right_shoulder_pitch_joint') {
          arcGroupRef.current.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI*2/3));
        } else if (jointName === 'torso_joint') {
          arcGroupRef.current.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI/3));
        }
        arcGroupRef.current.visible = true;
      } else {
        arcGroupRef.current.visible = false;
      }
    }

    // Проверяем столкновения после обновления позиций
    checkAllCollisions();
  }, [robotInstance, jointPositions, showArrows]);

  // Инициализация рендерера и камеры (при появлении/смене scene)
  useEffect(() => {
    if (!mountRef.current || !scene) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const aspect = width / height;
    const d = 0.6;

    // Если есть сохранённое положение — используем его
    let camera;
    if (lastCameraState.current.position && lastCameraState.current.rotation) {
      camera = new THREE.OrthographicCamera(
        -d * aspect, d * aspect, d, -d, 0.1, 1000
      );
      camera.position.copy(lastCameraState.current.position);
      camera.rotation.copy(lastCameraState.current.rotation);
    } else {
      camera = new THREE.OrthographicCamera(
      -d * aspect, d * aspect, d, -d, 0.1, 1000
    );
    camera.position.set(1.2, 0.5, 1);
    camera.rotation.x = -Math.PI / 2;
    }
    cameraRef.current = camera;

    // Создаем рендерер с оптимизациями
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(0.75); // или даже 0.5
    renderer.shadowMap.enabled = false; // отключаем тени
    renderer.setClearColor(0xf0f0f0); // Устанавливаем цвет фона сцены
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Добавляем освещение, если его еще нет
    if (!scene.children.some(child => child instanceof THREE.AmbientLight)) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(1, 1, 3);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    }

    // Создаем контролы
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.dampingFactor = 0.9;
    controls.minDistance = 0.5;
    controls.maxDistance = 2;
    controls.enableReset = false; // Отключаем возможность сброса камеры
    controlsRef.current = controls;

    // --- Скрываем дугу при начале вращения камеры ---
    const handleCameraStart = () => {
      // Убираем сброс выбранного цилиндра и дуги
      // setShowArrows(null);
      // setSelectedJoint(null);
      // Только отключаем перетаскивание
      isDraggingHandleRef.current = false;
      isDraggingArrowRef.current = false;
    };
    controls.addEventListener('start', handleCameraStart);

    const handleResize = () => {
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      const aspect = width / height;
      camera.left = -d * aspect;
      camera.right = d * aspect;
      camera.top = d;
      camera.bottom = -d;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // --- Ограниченный рендер ---
    let needsRender = true;
    let lastFrameTime = 0;
    let animationFrameId;
    const requestRender = () => { needsRender = true; };
    const renderLoop = (now) => {
      if (needsRender) {
      controls.update();
      renderer.render(scene, camera);
        needsRender = false;
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    animationFrameId = requestAnimationFrame(renderLoop);

    // Добавляем обработчики для выбора суставов
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function getMouseAngleOnArcPlane(event, arc, camera, jointIdx) {
      // Ось вращения сустава
      const jointName = handleJoints[jointIdx];
      const axis = getVisualAxis(jointName);
      if (!axis) {
        console.warn('Нет направления для сустава', jointName);
        return 0;
      }
      // Центр дуги в мировых координатах
      const arcWorldPos = new THREE.Vector3();
      arc.getWorldPosition(arcWorldPos);
      // Луч из камеры через мышь
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      const mouseNDC = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseNDC, camera);
      // Плоскость дуги
      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(axis, arcWorldPos);
      // Пересекаем луч с плоскостью
      const intersect = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersect);
      // Вектор от центра дуги до точки пересечения
      const v = intersect.clone().sub(arcWorldPos).normalize();
      // Базовый вектор для отсчёта угла (X в локальной системе дуги)
      let base = new THREE.Vector3(1, 0, 0);
      if (Math.abs(axis.dot(base)) > 0.99) base = new THREE.Vector3(0, 1, 0);
      base = base.sub(axis.clone().multiplyScalar(base.dot(axis))).normalize();
      // Угол между base и v в плоскости дуги
      return Math.atan2(v.clone().cross(base).dot(axis), v.dot(base));
    }

    function setCylinderOpacities(selectedIdx) {
      if (!handlesGroupRef.current) return;
      // Сначала все очень прозрачные
      handlesGroupRef.current.children.forEach((obj) => {
        if (obj.material) {
          obj.material.opacity = 0.15;
          obj.material.needsUpdate = true;
        }
      });
      if (selectedIdx === null) return;
      // Выбранный — яркий
      handlesGroupRef.current.children.forEach((obj) => {
        if (obj.userData.jointIdx === selectedIdx && obj.material) {
          obj.material.opacity = 0.92;
          obj.material.needsUpdate = true;
        }
      });
      // Дочерние — полупрозрачные
      let current = handleJoints[selectedIdx];
      let children = [];
      while (jointHierarchy[current] && jointHierarchy[current].length > 0) {
        const child = jointHierarchy[current][0];
        const idx = handleJoints.indexOf(child);
        if (idx !== -1) {
          children.push(idx);
          current = child;
        } else {
          break;
        }
      }
      handlesGroupRef.current.children.forEach((obj) => {
        if (children.includes(obj.userData.jointIdx) && obj.material) {
          obj.material.opacity = 0.3;
          obj.material.needsUpdate = true;
        }
      });
    }

    function onPointerDown(event) {
      if (!handlesGroupRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current);
      
      // Проверяем вращательную дугу/сектор через ref
      if (arcGroupRef.current && arcGroupRef.current.visible) {
        const intersects = raycaster.intersectObjects(arcGroupRef.current.children, true);
        if (intersects.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          if (controlsRef.current) controlsRef.current.enabled = false;
          isDraggingArrowRef.current = true;
          draggingArrowRef.current = 'rot';
          dragArrowOriginValueRef.current = jointPositions[showArrows];
          // Сохраняем текущий выбранный цилиндр вместо установки нового
          if (selectedJoint === null) {
            setSelectedJoint(showArrows);
          }
          dragArrowOriginAngleRef.current = getMouseAngleOnArcPlane(event, arcGroupRef.current, cameraRef.current, showArrows);
          setCylinderOpacities(selectedJoint !== null ? selectedJoint : showArrows);
          return;
        }
      }

      // Проверяем цилиндры-ручки
      const handleIntersects = raycaster.intersectObjects(handlesGroupRef.current.children, true);
      let foundHandle = null;
      for (const intersect of handleIntersects) {
        if (intersect.object.name && intersect.object.name.startsWith('handle_')) {
          const idx = intersect.object.userData.jointIdx;
          foundHandle = { idx, name: intersect.object.name.replace('handle_', '') };
          break;
        }
      }
      if (foundHandle) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedJoint(foundHandle.idx);
        setShowArrows(foundHandle.idx);
        setCylinderOpacities(foundHandle.idx);
        return;
      }

      // Если не попали ни в стрелки, ни в ручки — только включаем вращение модели
      if (controls) controls.enabled = true;
      isDraggingHandleRef.current = false;
      isDraggingArrowRef.current = false;
    }

    function onPointerMove(event) {
      if (!handlesGroupRef.current) return;
      // --- Drag дуги/сектора ---
      if (isDraggingArrowRef.current && draggingArrowRef.current === 'rot' && dragArrowOriginAngleRef.current !== null && dragArrowOriginValueRef.current !== null && showArrows !== null) {
        const idx = showArrows;
        const arcGroup = arcGroupRef.current;
        if (!arcGroup || !arcGroup.visible) return;
        // Проверяем, находится ли мышь над дугой или сектором
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        const mouseNDC = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouseNDC, cameraRef.current);
        const intersects = raycaster.intersectObjects(arcGroup.children, true);
        if (!arcGroup.userData) arcGroup.userData = {};
        if (!arcGroup.userData.wasOverArc) {
          arcGroup.userData.wasOverArc = false;
        }
        const isOverArc = intersects.length > 0;
        if (!isDraggingArrowRef.current) {
          if (arcGroup.userData.wasOverArc !== isOverArc) {
            arcGroup.userData.wasOverArc = isOverArc;
          }
        }
        if (!isOverArc) return;
        // Текущий угол мыши в плоскости дуги
        const currentAngle = getMouseAngleOnArcPlane(event, arcGroup, cameraRef.current, idx);
        let deltaAngle = currentAngle - dragArrowOriginAngleRef.current;
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
        const sensitivity = 1.0;
        
        // Определяем, нужно ли инвертировать направление вращения
        const jointName = handleJoints[idx];
        const shouldInvert = !jointName.includes('shoulder_pitch_joint') && !jointName.includes('torso_joint'); 
        
        // Инвертируем deltaAngle для всех суставов кроме ShoulderPitch и Torso
        if (shouldInvert) {
          deltaAngle = -deltaAngle;
        }
        
        let newValue = dragArrowOriginValueRef.current + deltaAngle * sensitivity;
        newValue = clampJointValue(idx, newValue);
        newValue = Math.round(newValue * 20) / 20;
        const newPositions = [...jointPositions];
        newPositions[idx] = newValue;
        // --- Только инициируем обновление через onPositionsFrom3D ---
        if (onPositionsFrom3D) {
          onPositionsFrom3D(newPositions);
        }
        return;
      }
      // --- Drag ручки ---
      if (isDraggingHandleRef.current && draggingIdxRef.current !== null && 
          dragOriginYRef.current !== null && dragOriginValueRef.current !== null) {
        const delta = (event.clientY - dragOriginYRef.current) * -0.01;
        let newValue = dragOriginValueRef.current + delta;
        newValue = Math.round(newValue * 20) / 20;
        const newPositions = [...jointPositions];
        newPositions[draggingIdxRef.current] = newValue;
        // --- Только инициируем обновление через onJointChange ---
        if (onJointChange) {
          onJointChange(newPositions);
        }
        return;
      }
    }

    function onPointerUp(event) {
      if (!handlesGroupRef.current) return;
      
      // Сбрасываем все флаги и состояния при отпускании кнопки мыши
      isDraggingArrowRef.current = false;
      draggingArrowRef.current = null;
      dragArrowOriginYRef.current = null;
      dragArrowOriginValueRef.current = null;
      dragArrowOriginAngleRef.current = null;
      isDraggingHandleRef.current = false;
      draggingIdxRef.current = null;
      dragOriginYRef.current = null;
      dragOriginValueRef.current = null;
      
      // Включаем контролы камеры обратно
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
      
      // Убираем сброс прозрачности цилиндров при отпускании
      // setCylinderOpacities(null);
      setDragStartY(null);
      setDragStartValue(null);
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    controls.addEventListener('change', requestRender);
    window.addEventListener('resize', requestRender);

    return () => {
      // Сохраняем положение камеры перед удалением
      if (cameraRef.current) {
        lastCameraState.current.position = cameraRef.current.position.clone();
        lastCameraState.current.rotation = cameraRef.current.rotation.clone();
      }
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      controls.removeEventListener('change', requestRender);
      controls.removeEventListener('start', handleCameraStart);
      mountRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [scene, robotInstance, jointPositions, onJointChange, showArrows, onMatrixChange, selectedBlockId, onAnimate, onPositionsFrom3D]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#f0f0f0', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {!isModelReady && (
        <div style={{ 
          position: 'absolute', 
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          color: '#fff'
        }}>
          <div style={{
            width: '200px',
            height: '4px',
            background: '#333',
            borderRadius: '2px',
            overflow: 'hidden',
            marginBottom: '12px'
          }}>
            <div style={{
              width: `${loadingProgress}%`,
              height: '100%',
              background: '#2563eb',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '14px' }}>
            Загрузка модели... {Math.round(loadingProgress)}%
          </div>
        </div>
      )}
      {selectedJoint !== null && isModelReady && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#fff', background: '#2563ebcc', padding: '6px 16px', borderRadius: 6, zIndex: 20 }}>
          Управление суставом: {jointNames[selectedJoint]}
        </div>
      )}
    </div>
  );
};

export default RobotViewer; 