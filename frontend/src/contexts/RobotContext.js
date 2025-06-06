import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

// Интервалы обновления в миллисекундах
const DEFAULT_INTERVAL = 5000;  // 5 секунд по умолчанию
const ACTIVE_INTERVAL = 2000;   // 2 секунды когда робот активен
const QUICK_CHECK_DELAY = 200;  // 500мс для быстрой проверки после действия

const RobotContext = createContext(null);

export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobot must be used within a RobotProvider');
  }
  return context;
};

export const RobotProvider = ({ children }) => {
  const [robotName, setRobotName] = useState('H-0000');
  const [robotStatus, setRobotStatus] = useState(null);
  const [robotConfig, setRobotConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(DEFAULT_INTERVAL);
  const [commandResult, setCommandResult] = useState(null);
  const [error, setError] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const [isQuickCheck, setIsQuickCheck] = useState(false);
  const [serverStatus, setServerStatus] = useState('ok');
  const updateTimerRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  const quickCheckTimerRef = useRef(null);

  // Функция для выполнения запроса к API (без логики соединения)
  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastUpdateTimeRef.current < currentInterval) {
      return;
    }
    try {
      setIsLoading(true);
      let hasError = false;
      
      try {
      const [statusRes, configRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/config')
      ]);

        if (!statusRes.ok || !configRes.ok) {
          hasError = true;
          setServerStatus('error');
          if (!statusRes.ok) {
            console.error('Ошибка статуса:', statusRes.status);
            setRobotStatus(null);
          }
          if (!configRes.ok) {
            console.error('Ошибка конфига:', configRes.status);
            setRobotConfig(null);
          }
        } else {
          const [statusData, configData] = await Promise.all([
            statusRes.json(),
            configRes.json()
          ]);
          
        setRobotStatus(statusData);
          setRobotConfig(configData);
          setRobotName(configData.RobotName || 'H-0000');
          setServerStatus('ok');
        }
      } catch (fetchError) {
        console.error('Ошибка при выполнении запросов:', fetchError);
        hasError = true;
        setServerStatus('error');
        setRobotStatus(null);
        setRobotConfig(null);
      }

      if (!hasError) {
      lastUpdateTimeRef.current = now;
      }
    } catch (error) {
      console.error('Общая ошибка загрузки данных:', error);
      setRobotStatus(null);
      setRobotConfig(null);
      setServerStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [currentInterval]);

  // Функция для быстрой проверки статуса после действия
  const scheduleQuickCheck = useCallback(() => {
    // Очищаем предыдущий таймер если он есть
    if (quickCheckTimerRef.current) {
      clearTimeout(quickCheckTimerRef.current);
    }
    
    // Устанавливаем флаг быстрой проверки
    setIsQuickCheck(true);
    
    // Планируем быструю проверку
    quickCheckTimerRef.current = setTimeout(async () => {
      try {
        await fetchData(true); // Принудительно обновляем данные
      } finally {
        setIsQuickCheck(false);
        quickCheckTimerRef.current = null;
      }
    }, QUICK_CHECK_DELAY);
  }, [fetchData]);

  // Эффект для обновления данных робота
  useEffect(() => {
    const pollData = () => {
      fetchData();
      updateTimerRef.current = setTimeout(pollData, currentInterval);
    };

    // Запускаем первый опрос
    pollData();

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, [fetchData, currentInterval]);

  // Эффект для очистки вывода через 10 секунд после завершения команды
  useEffect(() => {
    let timeoutId;
    // Очищаем только если есть вывод И команда не выполняется
    if (commandResult && !isExecuting && !robotStatus?.isProcessing) {
      timeoutId = setTimeout(() => {
        setCommandResult(null);
      }, 10000); // 10 секунд
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [commandResult, isExecuting, robotStatus?.isProcessing]);

  // Эффект для очистки ошибки через 5 секунд после завершения команды
  useEffect(() => {
    let timeoutId;
    // Очищаем только если есть ошибка И команда не выполняется
    if (error && !isExecuting && !robotStatus?.isProcessing) {
      timeoutId = setTimeout(() => {
        setError(null);
      }, 5000); // 5 секунд
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [error, isExecuting, robotStatus?.isProcessing]);

  // Отдельный эффект для интервала и состояния выполнения
  useEffect(() => {
    if (robotStatus) {
      const isRobotExecuting = robotStatus.isProcessing;
      // Обновляем интервал
      setCurrentInterval(isRobotExecuting ? ACTIVE_INTERVAL : DEFAULT_INTERVAL);
      // Обновляем состояние выполнения
      if (!isRobotExecuting && isExecuting) {
        setIsExecuting(false);
      }
    }
  }, [robotStatus, isExecuting]);

  // Модифицируем executeCommand для более точного отслеживания состояния
  const executeCommand = async (command) => {
    if (isExecuting || robotStatus?.isProcessing) {
      console.log('Команда уже выполняется');
      return;
    }

    setIsExecuting(true);
    setCommandResult(null);
    setError(null);
    // Принудительно обновляем статус сразу после запуска команды
    scheduleQuickCheck();

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.command }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка выполнения команды');
      }

      if (data.error) {
        setError(data.error);
        setCommandResult({ type: 'error', text: data.error });
        setIsExecuting(false);
      } else {
        setCommandResult({ type: 'success', text: data.output || 'Команда выполнена успешно' });
        // Принудительно обновляем статус после успешного выполнения
        await fetchData(true);
      }
    } catch (e) {
      const errorMsg = e.message || 'Ошибка выполнения команды';
      setError(errorMsg);
      setCommandResult({ type: 'error', text: errorMsg });
      setIsExecuting(false);
    }
  };

  // Модифицируем interruptCommand для более точного отслеживания состояния
  const interruptCommand = async () => {
    // Проверяем только isProcessing, так как это основной индикатор выполнения на сервере
    if (!robotStatus?.isProcessing) {
      console.log('Нет выполняемой команды для прерывания');
      return;
    }
    
    setIsInterrupting(true);
    // Принудительно обновляем статус перед прерыванием
    await fetchData(true);

    try {
      const response = await fetch('/api/interrupt', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при прерывании команды');
      }

      setError('Команда прервана пользователем');
      setCommandResult({ type: 'error', text: 'Команда прервана пользователем' });
      // Принудительно обновляем статус после прерывания
      await fetchData(true);
      // Сбрасываем состояние выполнения после успешного прерывания
      setIsExecuting(false);
    } catch (e) {
      const errorMsg = e.message || 'Ошибка при прерывании команды';
      setError(errorMsg);
      setCommandResult({ type: 'error', text: errorMsg });
      // Сбрасываем состояние выполнения при ошибке
      setIsExecuting(false);
    } finally {
      setIsInterrupting(false);
      // Еще раз обновляем статус после всех операций
      scheduleQuickCheck();
    }
  };

  return (
    <RobotContext.Provider value={{ 
      robotName, 
      robotStatus,
      robotConfig,
      isLoading,
      setRobotName,
      currentInterval,
      defaultInterval: DEFAULT_INTERVAL,
      activeInterval: ACTIVE_INTERVAL,
      commandResult,
      error,
      isExecuting,
      isInterrupting,
      isQuickCheck,
      executeCommand,
      interruptCommand,
      status: robotStatus,
      serverStatus,
      scheduleQuickCheck
    }}>
      {children}
    </RobotContext.Provider>
  );
}; 