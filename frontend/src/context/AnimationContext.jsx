import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

const AnimationContext = createContext();

export const AnimationProvider = ({ children }) => {
  const [jointPositions, setJointPositions] = useState(Array(9).fill(0));
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef(null);

  // Мгновенное обновление
  const setPositionsInstant = useCallback((positions) => {
    setJointPositions([...positions]);
  }, []);

  // Анимация к позиции
  const animateTo = useCallback((targetPositions, duration = 500, cb) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setIsAnimating(true);
    const startPositions = [...jointPositions];
    const startTime = performance.now();
    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const newPositions = startPositions.map((start, i) => start + (targetPositions[i] - start) * progress);
      setJointPositions(newPositions);
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setJointPositions(targetPositions);
        setIsAnimating(false);
        animationRef.current = null;
        if (cb) cb();
      }
    }
    animationRef.current = requestAnimationFrame(animate);
  }, [jointPositions]);

  // Анимация последовательности
  const animateSequence = useCallback((sequence, durations, cb) => {
    let idx = 0;
    let lastPositions = jointPositions;
    function next() {
      if (idx >= sequence.length) { setIsAnimating(false); if (cb) cb(); return; }
      const from = lastPositions;
      const to = sequence[idx];
      const duration = durations[idx] || 500;
      let startTime = null;
      function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const newPositions = from.map((start, i) => start + (to[i] - start) * progress);
        setJointPositions(newPositions);
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setJointPositions(to);
          lastPositions = to;
          idx++;
          next();
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    }
    setIsAnimating(true);
    next();
  }, [jointPositions]);

  // Очистка при размонтировании
  React.useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setIsAnimating(false);
  }, []);

  return (
    <AnimationContext.Provider value={{ jointPositions, setPositionsInstant, animateTo, animateSequence, isAnimating }}>
      {children}
    </AnimationContext.Provider>
  );
};

export const useAnimation = () => useContext(AnimationContext); 