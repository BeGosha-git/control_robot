/**
 * Группирует кнопки команд по тегам
 * @param {Array} buttons - Массив кнопок команд
 * @returns {Object} - Объект с сгруппированными командами
 */
export function groupButtonsByTag(buttons) {
  const groups = {};
  buttons.forEach(btn => {
    let tag = (btn.tag || '').trim().toLowerCase();
    if (!tag) tag = 'без тега';
    // build всегда исключаем
    if (tag.includes('build')) return;
    if (tag.includes('reset') || tag.includes('сброс')) tag = 'reset';
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(btn);
  });
  
  // Кнопка сброс всегда последняя в группе
  Object.keys(groups).forEach(tag => {
    const resetBtns = groups[tag].filter(b => tag === 'reset');
    const otherBtns = groups[tag].filter(b => tag !== 'reset');
    groups[tag] = [...otherBtns, ...resetBtns];
  });
  
  return groups;
}

/**
 * Фильтрует кнопки из конфига робота
 * @param {Object} robotConfig - Конфигурация робота
 * @returns {Array} - Отфильтрованный массив кнопок
 */
export function filterRobotButtons(robotConfig) {
  if (!robotConfig?.robotButtons) return [];
  return robotConfig.robotButtons.filter(b => b.showOnMain !== false);
} 