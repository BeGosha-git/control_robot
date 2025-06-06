const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const mime = require('mime-types');
const archiver = require('archiver');
const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Глобальные переменные для отслеживания состояния процесса
let isProcessing = false;
let currentProcess = null;
let currentProcessPid = null;
let currentCommand = null;
let lastCommand = null;
let lastResult = null;
let lastError = null;
let lastInterrupt = false;
let processStartTime = null;

// Константы для путей и типов
let ROOT_PATH = process.platform === 'win32' 
  ? path.join(process.cwd(), 'test_files')
  : '/home/unitree';
const ITEM_TYPES = {
  FILE: 'file',
  DIRECTORY: 'directory'
};

// Меняем путь к конфигурационному файлу на путь вне контейнера
const CONFIG_PATH = process.platform === 'win32'
  ? path.join(process.cwd(), 'backend', 'configs.conf')
  : '/home/unitree/configs.conf';

const DEFAULT_CONFIG = {
  robotButtons: [
    {
      id: 1,
      tag: 'build',
      name: 'Забилдить',
      command: 'cd /home/unitree/unitree_sdk2-main && cd build && cmake .. && make'
    },
    {
      id: 2,
      tag: 'reset',
      name: 'Сброс',
      command: '/home/unitree/unitree_sdk2-main/build/bin/H1_RESET_POSITION eth0'
    }
  ],
  rootPath: '/home/unitree',
  sdkPath: '/home/unitree/unitree_sdk2-main',
  RobotName: 'H-0000'
};

// Создаем тестовую директорию при запуске сервера
fs.mkdir(ROOT_PATH, { recursive: true }).catch(console.error);

// Утилиты для работы с файловой системой
const fsUtils = {
  // Безопасное соединение путей
  safeJoin: (base, target) => {
    const safeTarget = (target || '').replace(/^[/\\]+/, '');
    // Нормализуем пути для текущей ОС
    const normalizedBase = path.normalize(base);
    const normalizedTarget = path.normalize(safeTarget);
    return path.join(normalizedBase, normalizedTarget);
  },

  // Проверка безопасности пути
  isPathSafe: (fullPath) => {
    try {
      // Нормализуем пути, убирая лишние слеши в конце
      const normalizedPath = path.normalize(fullPath).replace(/\/+$/, '');
      const normalizedRoot = path.normalize(ROOT_PATH).replace(/\/+$/, '');
      
      // Проверяем, что путь начинается с ROOT_PATH
      const isSafe = normalizedPath === normalizedRoot || 
                    normalizedPath.startsWith(normalizedRoot + path.sep);
      
      if (!isSafe) {
        console.error(`[${new Date().toLocaleTimeString()}] Попытка доступа к запрещенному пути:`, {
          fullPath,
          normalizedPath,
          normalizedRoot,
          ROOT_PATH
        });
      }
      
      return isSafe;
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при проверке безопасности пути:`, error);
      return false;
    }
  },

  // Получение информации о файле/папке
  getItemInfo: async (itemPath) => {
    const stats = await fs.stat(itemPath);
    return {
      name: path.basename(itemPath),
      type: stats.isDirectory() ? ITEM_TYPES.DIRECTORY : ITEM_TYPES.FILE,
      path: path.relative(ROOT_PATH, itemPath).replace(/\\/g, '/'),
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      permissions: {
        readable: true,
        writable: true,
        executable: stats.mode & 0o111 ? true : false
      }
    };
  },

  // Проверка существования элемента
  checkExists: async (itemPath) => {
    try {
      await fs.access(itemPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
};

// Middleware для проверки безопасности пути
const checkPathSafety = (req, res, next) => {
  try {
    const requestedPath = req.query.path ?? req.body.path;
    
    // Если путь не указан, используем корневую директорию
    if (requestedPath === undefined || requestedPath === null) {
      req.fullPath = ROOT_PATH.replace(/\/+$/, '');
      return next();
    }

    // Нормализуем путь, убирая лишние слеши в начале и конце
    const normalizedPath = path.normalize(requestedPath).replace(/^[/\\]+/, '').replace(/\/+$/, '');
    const fullPath = fsUtils.safeJoin(ROOT_PATH.replace(/\/+$/, ''), normalizedPath);

    // Проверяем безопасность пути
    if (!fsUtils.isPathSafe(fullPath)) {
      console.error(`[${new Date().toLocaleTimeString()}] Попытка доступа к запрещенному пути:`, {
        fullPath,
        ROOT_PATH: ROOT_PATH.replace(/\/+$/, ''),
        normalizedPath
      });
      return res.status(403).json({
        error: 'Доступ запрещен',
        details: 'Попытка доступа к файлу вне разрешенной директории'
      });
    }

    req.fullPath = fullPath;
    next();
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при проверке пути:`, error);
    res.status(400).json({
      error: 'Некорректный путь',
      details: error.message
    });
  }
};

// API для работы с файловой системой
const fsRouter = express.Router();

// Получение списка файлов и папок
fsRouter.get('/list', checkPathSafety, async (req, res) => {
  try {
    const { fullPath } = req;
    
    // Проверяем существование директории
    const exists = await fsUtils.checkExists(fullPath);
    
    if (!exists) {
      return res.status(404).json({
        error: 'Директория не найдена',
        details: `Директория "${path.relative(ROOT_PATH, fullPath)}" не существует`
      });
    }

    // Проверяем, что путь ведет к директории
    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({
        error: 'Некорректный тип',
        details: 'Указанный путь является файлом, а не директорией'
      });
    }

    // Получаем список файлов и сразу собираем статистику
    const items = await fs.readdir(fullPath);
    let totalItems = 0;
    let directories = 0;
    let files = 0;
    
    const contents = await Promise.all(
      items
        .filter(item => !item.startsWith('.'))
        .map(async (item) => {
          try {
            const itemPath = path.join(fullPath, item);
            const itemStats = await fs.stat(itemPath);
            const isDirectory = itemStats.isDirectory();
            let childrenCount = undefined;
            if (isDirectory) {
              try {
                childrenCount = (await fs.readdir(itemPath)).filter(f => !f.startsWith('.')).length;
              } catch {}
            }
            // Получаем расширение файла
            let ext = undefined;
            if (!isDirectory && item.includes('.')) {
              ext = item.split('.').pop();
            }
            // Обновляем статистику
            totalItems++;
            if (isDirectory) {
              directories++;
            } else {
              files++;
            }

            return {
              name: item,
              type: isDirectory ? ITEM_TYPES.DIRECTORY : ITEM_TYPES.FILE,
              path: path.relative(ROOT_PATH, itemPath).replace(/\\/g, '/'),
              size: itemStats.size,
              modified: itemStats.mtime,
              created: itemStats.birthtime,
              permissions: {
                readable: true,
                writable: true,
                executable: itemStats.mode & 0o111 ? true : false
              },
              childrenCount,
              ext
            };
          } catch (error) {
            return null;
          }
        })
    );

    const validContents = contents
      .filter(item => item !== null)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === ITEM_TYPES.DIRECTORY ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

    // Возвращаем результат
    res.json({
      path: path.relative(ROOT_PATH, fullPath).replace(/\\/g, '/'),
      items: validContents,
      stats: { totalItems, directories, files }
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при получении списка файлов:`, error);
    res.status(500).json({
      error: 'Ошибка при получении списка файлов',
      details: error.message
    });
  }
});

// Получение содержимого файла
fsRouter.get('/content', checkPathSafety, async (req, res) => {
  try {
    const { fullPath } = req;
    const exists = await fsUtils.checkExists(fullPath);
    
    if (!exists) {
      return res.status(404).json({
        error: 'Файл не найден',
        details: `Файл "${path.basename(fullPath)}" не существует`
      });
    }

    const stats = await fs.stat(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'Некорректный тип',
        details: 'Указанный путь является директорией, а не файлом'
      });
    }

    const content = await fs.readFile(fullPath, 'utf8');
    const info = await fsUtils.getItemInfo(fullPath);
    
    res.json({
      ...info,
      content
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при чтении файла:`, error);
    res.status(500).json({
      error: 'Ошибка при чтении файла',
      details: error.message
    });
  }
});

// Сохранение содержимого файла
fsRouter.post('/content', checkPathSafety, async (req, res) => {
  try {
    const { fullPath } = req;
    const { content } = req.body;

    if (content === undefined) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка: содержимое не указано`);
      return res.status(400).json({
        error: 'Содержимое не указано',
        details: 'Необходимо указать содержимое файла'
      });
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
    
    const info = await fsUtils.getItemInfo(fullPath);
    res.json({
      ...info,
      message: 'Файл успешно сохранен'
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при сохранении файла:`, error);
    console.error('Детали ошибки:', {
      path: req.fullPath,
      contentLength: req.body.content?.length,
      errorCode: error.code,
      errorMessage: error.message,
      errorStack: error.stack
    });
    res.status(500).json({
      error: 'Ошибка при сохранении файла',
      details: error.message
    });
  }
});

// Создание файла или папки
fsRouter.post('/create', checkPathSafety, async (req, res) => {
  try {
    const { fullPath } = req;
    const { type } = req.body;

    if (!type || ![ITEM_TYPES.FILE, ITEM_TYPES.DIRECTORY].includes(type)) {
      return res.status(400).json({
        error: 'Неверный тип',
        details: 'Укажите тип: file или directory'
      });
    }

    const exists = await fsUtils.checkExists(fullPath);
    if (exists) {
      return res.status(400).json({
        error: 'Элемент уже существует',
        details: `Файл или директория "${path.basename(fullPath)}" уже существует`
      });
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    if (type === ITEM_TYPES.DIRECTORY) {
      await fs.mkdir(fullPath, { recursive: true });
    } else {
      await fs.writeFile(fullPath, '', 'utf8');
    }

    const info = await fsUtils.getItemInfo(fullPath);
    res.json({
      ...info,
      message: type === ITEM_TYPES.DIRECTORY ? 'Директория создана' : 'Файл создан'
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при создании:`, error);
    res.status(500).json({
      error: 'Ошибка при создании',
      details: error.message
    });
  }
});

// Удаление файла или папки
fsRouter.delete('/delete', checkPathSafety, async (req, res) => {
  try {
    const { fullPath } = req;
    const exists = await fsUtils.checkExists(fullPath);
    
    if (!exists) {
      return res.status(404).json({
        error: 'Элемент не найден',
        details: `Файл или директория "${path.basename(fullPath)}" не существует`
      });
    }

    const stats = await fs.stat(fullPath);
    const info = await fsUtils.getItemInfo(fullPath);

    if (stats.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }

    res.json({
      ...info,
      message: stats.isDirectory() ? 'Директория удалена' : 'Файл удален'
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при удалении:`, error);
    res.status(500).json({
      error: 'Ошибка при удалении',
      details: error.message
    });
  }
});

// Получение информации о файле или папке
fsRouter.get('/info', checkPathSafety, async (req, res) => {
  try {
    const { fullPath } = req;
    const exists = await fsUtils.checkExists(fullPath);
    
    if (!exists) {
      return res.status(404).json({
        error: 'Элемент не найден',
        details: `Файл или директория "${path.basename(fullPath)}" не существует`
      });
    }

    const info = await fsUtils.getItemInfo(fullPath);
    res.json(info);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при получении информации:`, error);
    res.status(500).json({
      error: 'Ошибка при получении информации',
      details: error.message
    });
  }
});

// Перемещение файла или папки
fsRouter.post('/move', async (req, res) => {
  try {
    const { source, destination, sources } = req.body;
    
    // Поддержка как одиночного, так и множественного перемещения
    const itemsToMove = sources || (source ? [{ source, destination }] : []);
    
    if (!itemsToMove.length) {
      return res.status(400).json({
        error: 'Неверные параметры',
        details: 'Необходимо указать исходный и целевой пути'
      });
    }

    const results = [];
    const errors = [];

    for (const item of itemsToMove) {
      const { source, destination } = item;
      const sourcePath = fsUtils.safeJoin(ROOT_PATH, source);
      const destPath = fsUtils.safeJoin(ROOT_PATH, destination);

      if (!fsUtils.isPathSafe(sourcePath) || !fsUtils.isPathSafe(destPath)) {
        errors.push({
          source,
          destination,
          error: 'Доступ запрещен',
          details: 'Попытка доступа к файлу вне разрешенной директории'
        });
        continue;
      }

      const sourceExists = await fsUtils.checkExists(sourcePath);
      if (!sourceExists) {
        errors.push({
          source,
          destination,
          error: 'Исходный элемент не найден',
          details: `Файл или директория "${path.basename(sourcePath)}" не существует`
        });
        continue;
      }

      const destExists = await fsUtils.checkExists(destPath);
      if (destExists) {
        errors.push({
          source,
          destination,
          error: 'Целевой элемент уже существует',
          details: `Файл или директория "${path.basename(destPath)}" уже существует`
        });
        continue;
      }

      try {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.rename(sourcePath, destPath);
        const info = await fsUtils.getItemInfo(destPath);
        results.push({
          ...info,
          message: 'Элемент успешно перемещен'
        });
      } catch (error) {
        errors.push({
          source,
          destination,
          error: 'Ошибка при перемещении',
          details: error.message
        });
      }
    }

    // Если были ошибки, но не все операции завершились с ошибкой
    if (errors.length > 0 && results.length > 0) {
      return res.status(207).json({
        message: 'Частичное перемещение',
        results,
        errors
      });
    }

    // Если все операции завершились с ошибкой
    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json({
        error: 'Ошибка при перемещении',
        errors
      });
    }

    // Если все операции успешны
    res.json({
      message: 'Элементы успешно перемещены',
      results
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при перемещении:`, error);
    res.status(500).json({
      error: 'Ошибка при перемещении',
      details: error.message
    });
  }
});

// Копирование файла или папки
fsRouter.post('/copy', async (req, res) => {
  try {
    const { source, destination } = req.body;
    
    if (!source || !destination) {
      return res.status(400).json({
        error: 'Неверные параметры',
        details: 'Необходимо указать исходный и целевой пути'
      });
    }

    const sourcePath = fsUtils.safeJoin(ROOT_PATH, source);
    const destPath = fsUtils.safeJoin(ROOT_PATH, destination);

    if (!fsUtils.isPathSafe(sourcePath) || !fsUtils.isPathSafe(destPath)) {
      return res.status(403).json({
        error: 'Доступ запрещен',
        details: 'Попытка доступа к файлу вне разрешенной директории'
      });
    }

    const sourceExists = await fsUtils.checkExists(sourcePath);
    if (!sourceExists) {
      return res.status(404).json({
        error: 'Исходный элемент не найден',
        details: `Файл или директория "${path.basename(sourcePath)}" не существует`
      });
    }

    const destExists = await fsUtils.checkExists(destPath);
    if (destExists) {
      return res.status(400).json({
        error: 'Целевой элемент уже существует',
        details: `Файл или директория "${path.basename(destPath)}" уже существует`
      });
    }

    const stats = await fs.stat(sourcePath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    if (stats.isDirectory()) {
      await fs.cp(sourcePath, destPath, { recursive: true });
    } else {
      await fs.copyFile(sourcePath, destPath);
    }

    const info = await fsUtils.getItemInfo(destPath);
    res.json({
      ...info,
      message: 'Элемент успешно скопирован'
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при копировании:`, error);
    res.status(500).json({
      error: 'Ошибка при копировании',
      details: error.message
    });
  }
});

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadPath = req.body.path ? fsUtils.safeJoin(ROOT_PATH, req.body.path) : ROOT_PATH;
    if (!fsUtils.isPathSafe(uploadPath)) {
      return cb(new Error('Доступ запрещен'));
    }
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Проверяем, не является ли файл скрытым
    if (file.originalname.startsWith('.')) {
      return cb(new Error('Скрытые файлы запрещены'));
    }
    cb(null, true);
  }
});

// Исправленный роут загрузки файлов и папок
fsRouter.post('/upload', upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Файлы не загружены',
        details: 'Необходимо выбрать файлы для загрузки'
      });
    }

    const uploadedFiles = [];
    for (const file of req.files) {
      if (!file.buffer) continue; // пропускаем невалидные записи (например, папки без файлов)
      const savePath = path.join(ROOT_PATH, req.body.path || '', file.originalname);
      await fs.mkdir(path.dirname(savePath), { recursive: true });
      await fs.writeFile(savePath, file.buffer);
      uploadedFiles.push({
        name: file.originalname,
        path: path.relative(ROOT_PATH, savePath).replace(/\\/g, '/'),
        size: file.size
      });
    }

    res.json({
      message: 'Файлы успешно загружены',
      files: uploadedFiles
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при загрузке файлов:`, error);
    res.status(500).json({
      error: 'Ошибка при загрузке файлов',
      details: error.message
    });
  }
});

// Инициализация ROOT_PATH из конфига при запуске
async function initializeRootPath() {
  try {
    const config = await readConfig();
    if (config.rootPath) {
      // Нормализуем путь для текущей ОС
      const normalizedPath = path.normalize(config.rootPath);
      
      // Проверяем существование директории
      try {
        await fs.access(normalizedPath, fs.constants.R_OK | fs.constants.W_OK);
        ROOT_PATH = normalizedPath;
      } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Ошибка доступа к ${normalizedPath}:`, error);
        // Если нет доступа к указанному пути, используем путь по умолчанию
        ROOT_PATH = process.platform === 'win32'
          ? path.join(process.cwd(), 'test_files')
          : '/home/unitree';
        await fs.mkdir(ROOT_PATH, { recursive: true });
      }
    } else {
      // Если путь не указан в конфиге, используем путь по умолчанию
      ROOT_PATH = process.platform === 'win32'
        ? path.join(process.cwd(), 'test_files')
        : '/home/unitree';
      await fs.mkdir(ROOT_PATH, { recursive: true });
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при инициализации корневого пути:`, error);
    // В случае ошибки используем путь по умолчанию
    ROOT_PATH = process.platform === 'win32'
      ? path.join(process.cwd(), 'test_files')
      : '/home/unitree';
    await fs.mkdir(ROOT_PATH, { recursive: true }).catch(console.error);
  }
}

// Вызываем инициализацию при запуске
initializeRootPath();

// Добавляем эндпоинт для изменения корневого пути
fsRouter.post('/set-root', async (req, res) => {
  try {
    const { newRoot } = req.body;
    if (!newRoot) {
      return res.status(400).json({
        error: 'Путь не указан',
        details: 'Необходимо указать новый корневой путь'
      });
    }

    const normalizedPath = path.normalize(newRoot);
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({
        error: 'Путь не существует',
        details: 'Указанный путь не существует'
      });
    }

    const stats = await fs.stat(normalizedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({
        error: 'Некорректный тип',
        details: 'Указанный путь должен быть директорией'
      });
    }

    // Обновляем ROOT_PATH и сохраняем в конфиг
    ROOT_PATH = normalizedPath;
    const config = await readConfig();
    config.rootPath = normalizedPath;
    await writeConfig(config);
    
    res.json({
      message: 'Корневой путь успешно изменен',
      newRoot: normalizedPath
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при изменении корневого пути:`, error);
    res.status(500).json({
      error: 'Ошибка при изменении корневого пути',
      details: error.message
    });
  }
});

// Эндпоинт для переименования файла или папки
fsRouter.post('/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({
        error: 'Неверные параметры',
        details: 'Необходимо указать старый и новый путь'
      });
    }
    if (path.basename(newPath).startsWith('.')) {
      return res.status(400).json({
        error: 'Недопустимое имя',
        details: 'Скрытые файлы и папки запрещены'
      });
    }
    const sourcePath = fsUtils.safeJoin(ROOT_PATH, oldPath);
    const destPath = fsUtils.safeJoin(ROOT_PATH, newPath);
    if (!fsUtils.isPathSafe(sourcePath) || !fsUtils.isPathSafe(destPath)) {
      return res.status(403).json({
        error: 'Доступ запрещен',
        details: 'Попытка доступа к файлу вне разрешенной директории'
      });
    }
    const sourceExists = await fsUtils.checkExists(sourcePath);
    if (!sourceExists) {
      return res.status(404).json({
        error: 'Исходный элемент не найден',
        details: `Файл или директория "${path.basename(sourcePath)}" не существует`
      });
    }
    const destExists = await fsUtils.checkExists(destPath);
    if (destExists) {
      return res.status(400).json({
        error: 'Целевой элемент уже существует',
        details: `Файл или директория "${path.basename(destPath)}" уже существует`
      });
    }
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(sourcePath, destPath);
    const info = await fsUtils.getItemInfo(destPath);
    res.json({
      ...info,
      message: 'Элемент успешно переименован'
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при переименовании:`, error);
    res.status(500).json({
      error: 'Ошибка при переименовании',
      details: error.message
    });
  }
});

// Endpoint для отдачи файлов в raw-режиме (например, для изображений)
fsRouter.get('/raw', checkPathSafety, async (req, res) => {
  try {
    const { fullPath } = req;
    const exists = await fsUtils.checkExists(fullPath);
    if (!exists) {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', mime.contentType(fullPath) || 'application/octet-stream');
    res.sendFile(fullPath, err => {
      if (err) {
        console.error('SEND FILE ERROR:', err);
        res.status(500).end();
      }
    });
  } catch (e) {
    console.error('RAW FILE ERROR:', e);
    res.status(500).end();
  }
});

// Endpoint для скачивания архива по списку путей
fsRouter.post('/zip', async (req, res) => {
  try {
    const { paths } = req.body;
    if (!Array.isArray(paths) || !paths.length) {
      return res.status(400).json({ error: 'Не переданы пути файлов/папок' });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="archive.zip"');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('ARCHIVE ERROR:', err);
      res.status(500).end();
    });
    archive.pipe(res);
    for (const relPath of paths) {
      const absPath = fsUtils.safeJoin(ROOT_PATH, relPath);
      const exists = await fsUtils.checkExists(absPath);
      if (!exists) continue;
      const stats = await fs.stat(absPath);
      if (stats.isDirectory()) {
        archive.directory(absPath, relPath);
      } else {
        archive.file(absPath, { name: relPath });
      }
    }
    archive.finalize();
  } catch (e) {
    console.error('ZIP ERROR:', e);
    res.status(500).end();
  }
});

// Подключаем роутер файловой системы
app.use('/api/fs', fsRouter);

// Добавляем новые утилиты для работы с процессами
const processUtils = {
  // Проверка существования процесса и его дочерних процессов
  isProcessRunning: async (pid) => {
    try {
      if (process.platform === 'win32') {
        // На Windows используем tasklist для проверки основного процесса
        const { exec } = require('child_process');
        const isMainProcessRunning = await new Promise((resolve) => {
          exec(`tasklist /FI "PID eq ${pid}"`, (error, stdout) => {
            resolve(stdout.toLowerCase().includes(pid.toString()));
          });
        });

        if (!isMainProcessRunning) return false;

        // Проверяем дочерние процессы
        const childPids = await processUtils.getChildProcesses(pid);
        if (childPids.length === 0) return true;

        // Проверяем каждый дочерний процесс
        const childProcessesStatus = await Promise.all(
          childPids.map(async (childPid) => {
            return new Promise((resolve) => {
              exec(`tasklist /FI "PID eq ${childPid}"`, (error, stdout) => {
                resolve(stdout.toLowerCase().includes(childPid.toString()));
              });
            });
          })
        );

        // Процесс считается активным, если основной процесс или хотя бы один дочерний процесс активен
        return isMainProcessRunning || childProcessesStatus.some(status => status);
      } else {
        // На Linux используем ps для проверки процесса и его группы
        const { exec } = require('child_process');
        return new Promise((resolve) => {
          exec(`ps -p ${pid} -o pid= || ps -p $(pgrep -P ${pid}) -o pid=`, (error, stdout) => {
            resolve(stdout.trim().length > 0);
          });
        });
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при проверке процесса ${pid}:`, error);
      return false;
    }
  },

  // Получение дочерних процессов с улучшенной обработкой
  getChildProcesses: async (pid) => {
    try {
    if (process.platform === 'win32') {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
          exec(`wmic process where (ParentProcessId=${pid}) get ProcessId /format:value`, (error, stdout) => {
          const pids = stdout.split('\n')
              .filter(line => line.includes('ProcessId='))
              .map(line => parseInt(line.split('=')[1].trim()))
            .filter(pid => !isNaN(pid));
          resolve(pids);
        });
      });
    } else {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(`ps --ppid ${pid} -o pid=`, (error, stdout) => {
          const pids = stdout.split('\n')
            .map(line => parseInt(line.trim()))
            .filter(pid => !isNaN(pid));
          resolve(pids);
        });
      });
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при получении дочерних процессов ${pid}:`, error);
      return [];
    }
  },

  // Улучшенное завершение процесса и его дочерних процессов
  terminateProcess: async (pid, force = false) => {
    try {
      // Сначала проверяем, существует ли процесс
      const isRunning = await processUtils.isProcessRunning(pid);
      if (!isRunning) {
        console.log(`[${new Date().toLocaleTimeString()}] Процесс ${pid} уже завершен`);
        return true; // Возвращаем true, так как процесс уже завершен
      }

      // Получаем все дочерние процессы
      const childPids = await processUtils.getChildProcesses(pid);
      const allPids = [pid, ...childPids];
      
      // Сначала пробуем корректно завершить все процессы
      if (!force) {
        for (const processPid of allPids) {
        try {
          if (process.platform === 'win32') {
              process.kill(processPid, 'SIGTERM');
          } else {
              process.kill(-processPid, 'SIGTERM');
          }
        } catch (error) {
            // Игнорируем ошибку ESRCH, так как процесс мог уже завершиться
            if (error.code !== 'ESRCH') {
              console.error(`[${new Date().toLocaleTimeString()}] Ошибка при отправке SIGTERM процессу ${processPid}:`, error);
            }
        }
      }

      // Даем процессам время на корректное завершение
        await new Promise(resolve => setTimeout(resolve, 2000));

      // Проверяем, остались ли живые процессы
        const stillRunning = await Promise.all(
          allPids.map(async (processPid) => await processUtils.isProcessRunning(processPid))
        );

        // Если все процессы завершились, возвращаем успех
        if (!stillRunning.some(running => running)) {
          return true;
        }
        }
        
      // Если требуется принудительное завершение или процессы не завершились
      for (const processPid of allPids) {
            try {
              if (process.platform === 'win32') {
            const { exec } = require('child_process');
            await new Promise((resolve) => {
              exec(`taskkill /F /PID ${processPid}`, (error) => {
                // Игнорируем ошибку, если процесс уже завершен
                if (error && !error.message.includes('не найдены процессы')) {
                  console.error(`[${new Date().toLocaleTimeString()}] Ошибка при принудительном завершении процесса ${processPid}:`, error);
                }
                resolve();
              });
            });
              } else {
            try {
              process.kill(-processPid, 'SIGKILL');
            } catch (error) {
              // Игнорируем ошибку ESRCH
              if (error.code !== 'ESRCH') {
                throw error;
              }
            }
          }
        } catch (error) {
          // Игнорируем ошибку ESRCH
          if (error.code !== 'ESRCH') {
            console.error(`[${new Date().toLocaleTimeString()}] Ошибка при принудительном завершении процесса ${processPid}:`, error);
            }
          }
        }

      // Даем время на завершение процессов
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Финальная проверка
      const finalCheck = await Promise.all(
        allPids.map(async (processPid) => await processUtils.isProcessRunning(processPid))
      );

      return !finalCheck.some(running => running);
    } catch (error) {
      // Игнорируем ошибку ESRCH
      if (error.code === 'ESRCH') {
        return true;
      }
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при завершении процесса ${pid}:`, error);
      return false;
    }
  }
};

// Обновляем функцию очистки процесса
const cleanupProcess = async () => {
  if (currentProcessPid) {
    try {
      // Пробуем корректно завершить процесс и его дочерние процессы
      const success = await processUtils.terminateProcess(currentProcessPid, false);
      
      if (!success) {
        // Если не удалось корректно завершить, пробуем принудительно
        await processUtils.terminateProcess(currentProcessPid, true);
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при очистке процесса:`, error);
    }
  }
  
  // Очищаем состояние
  isProcessing = false;
  currentProcess = null;
  currentProcessPid = null;
  currentCommand = null;
  processStartTime = null;
};

// Обновляем эндпоинт для статуса выполнения команд
app.get('/api/status', async (req, res) => {
  try {
    // Проверяем, действительно ли процесс все еще запущен
    if (isProcessing && currentProcessPid) {
      const isRunning = await processUtils.isProcessRunning(currentProcessPid);
      if (!isRunning) {
        console.log(`[${new Date().toLocaleTimeString()}] Процесс ${currentProcessPid} завершился некорректно`);
        await cleanupProcess();
      }
    }

    // Вычисляем время выполнения, если процесс активен
    let executionTime = null;
    if (isProcessing && processStartTime) {
      executionTime = Math.floor((Date.now() - processStartTime) / 1000);
    }

    res.json({
      isProcessing,
      currentCommand,
      lastCommand,
      lastResult,
      lastError,
      lastInterrupt,
      executionTime,
      processPid: currentProcessPid
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при получении статуса:`, error);
    res.status(500).json({
      error: 'Ошибка при получении статуса',
      details: error.message
    });
  }
});

// Обновляем обработчик /api/execute
app.post('/api/execute', async (req, res) => {
  let sentResponse = false;
  
  // Проверяем, не выполняется ли уже команда
  if (isProcessing && currentProcessPid) {
    const isRunning = await processUtils.isProcessRunning(currentProcessPid);
    if (isRunning) {
      return res.status(400).json({ 
        error: 'Команда уже выполняется',
        currentCommand,
        executionTime: processStartTime ? Math.floor((Date.now() - processStartTime) / 1000) : null
      });
    } else {
      // Если процесс не запущен, но флаг isProcessing установлен, очищаем состояние
      await cleanupProcess();
    }
  }

  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Команда не указана' });
  }

  // Инициализируем состояние процесса
    isProcessing = true;
    currentCommand = command;
  lastCommand = command;
  lastResult = null;
  lastError = null;
    lastInterrupt = false;
  processStartTime = Date.now();

  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
  // Добавляем sudo для выполнения команд на хост-системе
  const fullCommand = process.platform === 'win32' 
    ? `cmd.exe /c "${command}"` 
    : `sudo /bin/bash -c "${command}"`;

  // Используем spawn вместо exec для лучшего контроля над процессом
  const proc = spawn(shell, process.platform === 'win32' 
    ? ['/c', command] 
    : ['-c', `sudo ${command}`], {
    windowsHide: true,
    detached: process.platform !== 'win32' // На Linux создаем новую группу процессов
  });

    currentProcess = proc;
    currentProcessPid = proc.pid;

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка выполнения команды:`, error);
    lastError = error.message;
      if (!sentResponse) {
        res.status(500).json({ 
          error: 'Ошибка выполнения команды',
          details: error.message
        });
        sentResponse = true;
      }
      cleanupProcess();
    });

    proc.on('close', async (code, signal) => {
      try {
        if (signal) {
          lastInterrupt = true;
        lastError = `Команда завершена сигналом: ${signal}`;
          if (!sentResponse) {
            res.json({ 
            error: lastError,
              details: stderr
            });
            sentResponse = true;
          }
      } else if (code !== 0) {
          console.error(`[${new Date().toLocaleTimeString()}] Ошибка выполнения команды ${command}:`, stderr);
        lastError = `Команда завершилась с кодом ${code}`;
          if (!sentResponse) {
            res.json({ 
            error: lastError,
              details: stderr
            });
            sentResponse = true;
          }
      } else {
        lastResult = stdout;
        if (!sentResponse) {
          res.json({ 
            output: stdout,
            details: stderr
          });
          sentResponse = true;
        }
        }
      } catch (e) {
        console.error('Ошибка в обработчике завершения процесса:', e);
      lastError = e.message;
        if (!sentResponse) {
          res.status(500).json({ 
            error: 'Ошибка в обработчике завершения процесса',
            details: e.message
          });
          sentResponse = true;
        }
    } finally {
      await cleanupProcess();
      }
    });

  // Отвязываем процесс от родительского (на Linux)
  if (process.platform !== 'win32') {
    proc.unref();
  }
});

// Обновляем обработчик /api/interrupt
app.post('/api/interrupt', async (req, res) => {
  if (isProcessing && currentProcessPid) {
    try {
      const success = await processUtils.terminateProcess(currentProcessPid, false);
      
      if (!success) {
        // Если не удалось корректно завершить, пробуем принудительно
        await processUtils.terminateProcess(currentProcessPid, true);
      }

      isProcessing = false;
      currentProcess = null;
      currentProcessPid = null;
      currentCommand = null;
      lastInterrupt = true;
      
      console.log(`[${new Date().toLocaleTimeString()}] Команда прервана пользователем`);
      return res.json({ 
        success: true, 
        message: 'Команда прервана',
        platform: process.platform
      });
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при прерывании команды:`, error);
      return res.status(500).json({ 
        error: 'Ошибка при прерывании команды',
        details: error.message,
        platform: process.platform
      });
    }
  }
    return res.status(400).json({ 
      error: 'Нет выполняемой команды',
      isProcessing,
      currentCommand
    });
});

// Чтение конфига
async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') {
      await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      return DEFAULT_CONFIG;
    }
    throw e;
  }
}

// Запись конфига
async function writeConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// Получить конфиг
app.get('/api/config', async (req, res) => {
  try {
    const config = await readConfig();
    // Нормализуем пути в конфиге перед отправкой
    if (config.rootPath) {
      config.rootPath = path.normalize(config.rootPath);
    }
    res.json(config);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка чтения конфига:`, error);
    res.status(500).json({ 
      error: 'Ошибка чтения конфига', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Сохранить конфиг
app.post('/api/config', async (req, res) => {
  try {
    const config = req.body;
    
    if (!config.RobotName || !config.rootPath || !config.sdkPath) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля: RobotName, rootPath, sdkPath' });
    }

    // Проверяем CMakeLists.txt при сохранении конфига
    try {
      const cmakePath = path.join(config.sdkPath, 'example', 'h1', 'CMakeLists.txt');
      await fs.access(cmakePath, fs.constants.R_OK);
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Нет доступа к CMakeLists.txt:`, error);
      return res.status(400).json({ 
        error: 'Ошибка доступа к SDK',
        details: 'Не удалось получить доступ к CMakeLists.txt. Проверьте путь к SDK и права доступа.'
      });
    }

    // Сохраняем конфиг через sudo
    const configContent = JSON.stringify(config, null, 2);
    const tempPath = path.join('/tmp', `config_${Date.now()}.json`);
    
    try {
      // Сначала записываем во временный файл
      await fs.writeFile(tempPath, configContent, 'utf8');
      
      // Затем перемещаем через sudo
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(`sudo mv ${tempPath} ${CONFIG_PATH}`, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при сохранении конфига:`, error);
      // Пробуем удалить временный файл в случае ошибки
      try {
        await fs.unlink(tempPath);
      } catch (unlinkError) {
        console.error('Ошибка при удалении временного файла:', unlinkError);
      }
      res.status(500).json({ 
        error: 'Ошибка при сохранении конфигурации',
        details: error.message
      });
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при сохранении конфига:`, error);
    res.status(500).json({ 
      error: 'Ошибка при сохранении конфигурации',
      details: error.message
    });
  }
});

// Добавляем функцию для обновления CMakeLists.txt
async function updateCMakeLists(sdkPath, validFiles) {
  try {
    const cmakePath = path.join(sdkPath, 'example', 'h1', 'CMakeLists.txt');
    let cmakeContent = await fs.readFile(cmakePath, 'utf8');
    
    // Находим все строки с файлами в high_level директории
    const fileRegex = /(add_executable\([^)]+high_level\/[^)]+\))/g;
    const lines = cmakeContent.split('\n');
    const updatedLines = [];
    let skipNextLine = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Если это строка с add_executable и high_level
      if (line.includes('add_executable') && line.includes('high_level')) {
        const fileNameMatch = line.match(/high_level\/([^)\s]+\.cpp)/);
        if (fileNameMatch) {
          const fileName = fileNameMatch[1];
          // Если файл существует, оставляем строку
          if (validFiles.includes(fileName)) {
            updatedLines.push(line);
            // Добавляем следующую строку с target_link_libraries
            if (i + 1 < lines.length && lines[i + 1].includes('target_link_libraries')) {
              updatedLines.push(lines[i + 1]);
              i++; // Пропускаем следующую строку, так как мы её уже добавили
            }
          } else {
            // Если файл не существует, пропускаем текущую строку и следующую (target_link_libraries)
            i++; // Пропускаем следующую строку
            console.log(`[${new Date().toLocaleTimeString()}] Удалена запись для несуществующего файла: ${fileName}`);
          }
        } else {
          updatedLines.push(line);
        }
      } else {
        updatedLines.push(line);
      }
    }
    
    // Записываем обновленное содержимое
    const updatedContent = updatedLines.join('\n');
    if (updatedContent !== cmakeContent) {
      await fs.writeFile(cmakePath, updatedContent, 'utf8');
      console.log(`[${new Date().toLocaleTimeString()}] CMakeLists.txt обновлен`);
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при обновлении CMakeLists.txt:`, error);
  }
}

// Добавляем функцию для принудительной очистки при запуске
async function forceCleanupCMakeLists() {
  try {
    const config = await readConfig();
    const sdkPath = config.sdkPath;

    if (!sdkPath) {
      console.log(`[${new Date().toLocaleTimeString()}] SDK путь не указан в конфиге, пропускаем очистку`);
      return;
    }

    console.log(`[${new Date().toLocaleTimeString()}] Выполняем принудительную очистку CMakeLists.txt при запуске`);
    console.log(`[${new Date().toLocaleTimeString()}] Путь к SDK: ${sdkPath}`);

    const wasCleaned = await cleanupCMakeLists(sdkPath);
    console.log(`[${new Date().toLocaleTimeString()}] Результат очистки: ${wasCleaned ? 'файл обновлен' : 'изменений не требуется'}`);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при принудительной очистке:`, error);
    console.error(`[${new Date().toLocaleTimeString()}] Стек ошибки:`, error.stack);
  }
}

// Обновляем функцию cleanupCMakeLists для более строгой проверки
async function cleanupCMakeLists(sdkPath) {
  try {
    const cmakePath = path.join(sdkPath, 'example', 'h1', 'CMakeLists.txt');
    
    try {
      await fs.access(cmakePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Нет доступа к CMakeLists.txt:`, error);
      return false;
    }

    let cmakeContent = await fs.readFile(cmakePath, 'utf8');
    cmakeContent = cmakeContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    const lines = cmakeContent.split('\n');
    const updatedLines = [];
    let hasChanges = false;
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i].trim();
      
      if (line.includes('add_executable')) {
        const fileMatch = line.match(/(?:high_level|low_level)\/([^)\s]+\.cpp)/);
        if (fileMatch) {
          const fileName = fileMatch[1];
          const fileType = line.includes('high_level') ? 'high_level' : 'low_level';
          const filePath = path.join(sdkPath, 'example', 'h1', fileType, fileName);
          
          try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
              throw new Error('Not a file');
            }
            updatedLines.push(lines[i]);
            if (i + 1 < lines.length && lines[i + 1].includes('target_link_libraries')) {
              updatedLines.push(lines[i + 1]);
            }
          } catch (error) {
            hasChanges = true;
          }
          i += 2;
        } else {
          updatedLines.push(lines[i]);
          i++;
        }
      } else {
        updatedLines.push(lines[i]);
        i++;
      }
    }
    
    if (hasChanges) {
      while (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() === '') {
        updatedLines.pop();
      }
      const updatedContent = updatedLines.join('\n') + '\n';
      
      try {
        await fs.writeFile(cmakePath, updatedContent, 'utf8');
        return true;
      } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Ошибка при записи в CMakeLists.txt:`, error);
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при очистке CMakeLists.txt:`, error);
    return false;
  }
}

// Обновляем функцию getValidMotionFiles
async function getValidMotionFiles(sdkPath) {
  try {
    // Сначала очищаем CMakeLists.txt от несуществующих файлов
    await cleanupCMakeLists(sdkPath);
    
    const cmakePath = path.join(sdkPath, 'example', 'h1', 'CMakeLists.txt');
    const cmakeContent = await fs.readFile(cmakePath, 'utf8');
    
    // Ищем все файлы в high_level директории
    const fileRegex = /high_level\/([^)\s]+\.cpp)/g;
    const files = [];
    let match;
    
    while ((match = fileRegex.exec(cmakeContent)) !== null) {
      files.push(match[1]); // Добавляем все файлы из CMakeLists.txt
    }
    
    return files;
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при чтении CMakeLists.txt:`, error);
    return [];
  }
}

// Добавляем функцию для добавления нового файла в CMakeLists.txt
async function addFileToCMakeLists(sdkPath, fileName) {
  try {
    const cmakePath = path.join(sdkPath, 'example', 'h1', 'CMakeLists.txt');
    let cmakeContent = await fs.readFile(cmakePath, 'utf8');
    cmakeContent = cmakeContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    if (cmakeContent.includes(`high_level/${fileName}`)) {
      return;
    }

    const execName = fileName.replace('.cpp', '');
    const newLines = [
      `add_executable(${execName} high_level/${fileName})`,
      `target_link_libraries(${execName} unitree_sdk2)`
    ].join('\n');

    while (cmakeContent.endsWith('\n\n')) {
      cmakeContent = cmakeContent.slice(0, -1);
    }
    
    const updatedContent = cmakeContent + '\n\n' + newLines + '\n';
    await fs.writeFile(cmakePath, updatedContent, 'utf8');
    console.log(`[${new Date().toLocaleTimeString()}] Добавлена запись для нового файла: ${fileName}`);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при добавлении файла в CMakeLists.txt:`, error);
    throw error;
  }
}

// Обновляем эндпоинт для сохранения файла движения
app.post('/api/motion/save', async (req, res) => {
  try {
    const { filename, content } = req.body;
    
    if (!filename || !content) {
      return res.status(400).json({
        error: 'Неверные параметры',
        details: 'Необходимо указать имя файла и содержимое'
      });
    }

    // Получаем конфиг
    const config = await readConfig();
    const sdkPath = config.sdkPath;

    if (!sdkPath) {
      return res.status(400).json({
        error: 'Не указан путь к SDK',
        details: 'Необходимо указать sdkPath в конфигурации'
      });
    }

    // Формируем полный путь к файлу
    const fullPath = path.join(sdkPath, 'example', 'h1', 'high_level', filename);

    // Проверяем, существует ли файл
    const fileExists = await fsUtils.checkExists(fullPath);

    // Сначала сохраняем файл
    await fs.writeFile(fullPath, content, 'utf8');

    // Проверяем и очищаем CMakeLists.txt
    try {
      await cleanupCMakeLists(sdkPath);
      
      // Проверяем наличие записи о текущем файле в CMakeLists.txt
      const cmakePath = path.join(sdkPath, 'example', 'h1', 'CMakeLists.txt');
      const cmakeContent = await fs.readFile(cmakePath, 'utf8');

      // Если записи о файле нет, добавляем её
      if (!cmakeContent.includes(`high_level/${filename}`)) {
        console.log(`[${new Date().toLocaleTimeString()}] Запись о файле ${filename} отсутствует в CMakeLists.txt, добавляем...`);
        await addFileToCMakeLists(sdkPath, filename);
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка при проверке CMakeLists.txt:`, error);
      // Не возвращаем ошибку, так как файл уже сохранен
    }
    
    res.json({
      message: 'Файл успешно сохранен',
      path: path.join('example', 'h1', 'high_level', filename).replace(/\\/g, '/'),
      fullPath: fullPath.replace(/\\/g, '/'),
      isNew: !fileExists
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при сохранении файла движения:`, {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Ошибка при сохранении файла',
      details: error.message
    });
  }
});

// Обновляем эндпоинт для получения списка файлов движений
app.get('/api/motion/files', async (req, res) => {
  try {
    const config = await readConfig();
    const sdkPath = config.sdkPath;

    if (!sdkPath) {
      return res.status(400).json({
        error: 'Не указан путь к SDK',
        details: 'Необходимо указать sdkPath в конфигурации'
      });
    }

    const wasCleaned = await cleanupCMakeLists(sdkPath);
    const cmakePath = path.join(sdkPath, 'example', 'h1', 'CMakeLists.txt');
    const cmakeContent = await fs.readFile(cmakePath, 'utf8');
    const fileRegex = /high_level\/([^)\s]+\.cpp)/g;
    const files = [];
    let match;
    
    while ((match = fileRegex.exec(cmakeContent)) !== null) {
      const fileName = match[1];
      const filePath = path.join(sdkPath, 'example', 'h1', 'high_level', fileName);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          files.push(fileName);
        }
      } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Файл не найден: ${filePath}`);
      }
    }

    res.json({
      files,
      wasCleaned
    });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при получении списка файлов:`, error);
    console.error(`[${new Date().toLocaleTimeString()}] Стек ошибки:`, error.stack);
    res.status(500).json({
      error: 'Ошибка при получении списка файлов',
      details: error.message
    });
  }
});

// Функция для поиска файлов с updateJointPositions
async function findFilesWithUpdateJointPositions(sdkPath) {
  try {
    const highLevelPath = path.join(sdkPath, 'example', 'h1', 'high_level');
    const exists = await fsUtils.checkExists(highLevelPath);

    if (!exists) {
      console.error(`[${new Date().toLocaleTimeString()}] Директория high_level не найдена`);
      return [];
    }

    const files = await fs.readdir(highLevelPath);
    const validFiles = [];
    
    for (const file of files) {
      if (!file.endsWith('.cpp')) continue;
      
      const filePath = path.join(highLevelPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        if (content.includes('updateJointPositions')) {
          validFiles.push(file);
        }
      } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Ошибка при чтении файла ${file}:`, error);
      }
    }
    
    return validFiles;
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при поиске файлов:`, {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    return [];
  }
    }

// Добавляем новый эндпоинт для получения списка файлов с updateJointPositions
app.get('/api/motion/valid-files', async (req, res) => {
  try {
    const config = await readConfig();
    const sdkPath = config.sdkPath;

    if (!sdkPath) {
      return res.status(400).json({
        error: 'Не указан путь к SDK',
        details: 'Необходимо указать sdkPath в конфигурации'
      });
    }

    const files = await findFilesWithUpdateJointPositions(sdkPath);
    res.json({ files });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при получении списка валидных файлов:`, error);
    res.status(500).json({
      error: 'Ошибка при получении списка файлов',
      details: error.message
    });
  }
});

// Добавляем эндпоинт для получения содержимого файла движения
app.get('/api/motions/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const config = await readConfig();
    const sdkPath = config.sdkPath;

    if (!sdkPath) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка: не указан путь к SDK`);
      return res.status(400).json({
        error: 'Не указан путь к SDK',
        details: 'Необходимо указать sdkPath в конфигурации'
      });
    }

    const fullPath = path.join(sdkPath, 'example', 'h1', 'high_level', filename);
    const exists = await fsUtils.checkExists(fullPath);
    
    if (!exists) {
      console.error(`[${new Date().toLocaleTimeString()}] Ошибка: файл не найден:`, fullPath);
      return res.status(404).json({
        error: 'Файл не найден',
        details: `Файл "${filename}" не существует`
      });
    }

    const content = await fs.readFile(fullPath, 'utf8');
    res.json({ content });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при чтении файла движения:`, {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Ошибка при чтении файла',
      details: error.message
    });
  }
});

// Утилита для работы с логами
const logUtils = {
  // Максимальное количество логов в памяти
  MAX_LOGS: 1000,
  
  // Хранилище логов
  logs: [],
  
  // Добавление лога
  addLog: (message, type = 'info') => {
    const log = {
      timestamp: Date.now(),
      message,
      type
    };
    logUtils.logs.unshift(log);
    // Ограничиваем количество логов
    if (logUtils.logs.length > logUtils.MAX_LOGS) {
      logUtils.logs.pop();
    }
  },
  
  // Получение логов
  getLogs: (limit = 100) => {
    return logUtils.logs.slice(0, limit);
  },
  
  // Очистка логов
  clearLogs: () => {
    logUtils.logs = [];
  }
};

// Перехватываем console.log, console.error и console.warn
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  logUtils.addLog(message, 'info');
  originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  logUtils.addLog(message, 'error');
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  logUtils.addLog(message, 'warning');
  originalConsoleWarn.apply(console, args);
};

// Эндпоинт для получения логов
app.get('/api/logs', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = logUtils.getLogs(Number(limit));
    res.json({ logs });
  } catch (error) {
    console.error('Ошибка при получении логов:', error);
    res.status(500).json({
      error: 'Ошибка при получении логов',
      details: error.message
    });
  }
});

// Эндпоинт для очистки логов
app.post('/api/logs/clear', async (req, res) => {
  try {
    logUtils.clearLogs();
    res.json({ message: 'Логи успешно очищены' });
  } catch (error) {
    console.error('Ошибка при очистке логов:', error);
    res.status(500).json({ 
      error: 'Ошибка при очистке логов',
      details: error.message
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[${new Date().toLocaleTimeString()}] Сервер запущен на порту ${port}`);
}); 