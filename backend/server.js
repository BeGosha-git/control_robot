const express = require('express');
const http = require('http');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const mime = require('mime-types');
const archiver = require('archiver');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const port = 3001;

// Middleware
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
function getTestFilesPath() {
    if (process.platform === 'win32') {
        // Windows разработка
        return path.join(process.cwd(), 'test_files');
    } else {
        // Debian продакшен
        return '/home/unitree/control_robot/backend/test_files';
    }
}

let ROOT_PATH = getTestFilesPath();
const ITEM_TYPES = {
  FILE: 'file',
  DIRECTORY: 'directory'
};

const CONFIG_PATH = path.join(process.cwd(), 'configs.conf');
const DEFAULT_CONFIG = {
  robotButtons: [
    {
      id: 1,
      tag: 'build',
      name: 'Забилдить',
      command: 'cd /home/unitree/unitree_sdk2&&cd build&&cmake ..&&make'
    },
    {
      id: 2,
      tag: 'reset',
      name: 'Сброс',
      command: '/home/unitree/unitree_sdk2/build/bin/H1_RESET_POSITION eth0'
    }
  ],
  rootPath: getTestFilesPath(),
  RobotName: 'H-0000'
};

// Создаем тестовую директорию при запуске сервера
fs.mkdir(ROOT_PATH, { recursive: true }).catch(console.error);

// Функции для работы с конфигом
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

async function writeConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

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
        ROOT_PATH = getTestFilesPath();
        await fs.mkdir(ROOT_PATH, { recursive: true });
      }
    } else {
      // Если путь не указан в конфиге, используем путь по умолчанию
      ROOT_PATH = getTestFilesPath();
      await fs.mkdir(ROOT_PATH, { recursive: true });
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Ошибка при инициализации корневого пути:`, error);
    // В случае ошибки используем путь по умолчанию
    ROOT_PATH = getTestFilesPath();
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

// Переменные для управления Python процессом
let pythonProcess = null;
let isPythonRunning = false;

// Функция запуска Python сервиса
function startPythonService() {
    if (isPythonRunning) {
        console.log('Python сервис уже запущен');
        return;
    }

    const pythonPath = path.join(__dirname, 'src', 'services', 'camera_service.py');
    
    // Определяем путь к виртуальному окружению в зависимости от ОС
    let venvPython;
    if (process.platform === 'win32') {
        // Windows
        venvPython = path.join(__dirname, 'src', 'services', '.venv', 'Scripts', 'python.exe');
    } else {
        // Linux/Debian
        venvPython = path.join(__dirname, 'src', 'services', '.venv', 'bin', 'python');
    }
    
    console.log('Запуск Python сервиса камер...');
    
    // Проверяем наличие виртуального окружения
    let pythonExecutable = 'python3';
    if (require('fs').existsSync(venvPython)) {
        pythonExecutable = venvPython;
        console.log('Используется виртуальное окружение Python');
    } else {
        console.log('Виртуальное окружение не найдено, используется системный Python3');
    }
    
    pythonProcess = spawn(pythonExecutable, [pythonPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PYTHONPATH: path.join(__dirname, 'src', 'services')
        }
    });

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python процесс завершен с кодом ${code}`);
        isPythonRunning = false;

        // Перезапускаем через 5 секунд только если это не было принудительное завершение
        if (code !== 0 && code !== null) {
            setTimeout(() => {
                if (!isPythonRunning) {
                    console.log('Перезапуск Python сервиса...');
                    startPythonService();
                }
            }, 5000);
        }
    });

    pythonProcess.on('error', (error) => {
        console.error('Ошибка запуска Python процесса:', error);
        isPythonRunning = false;
    });

    isPythonRunning = true;
    console.log('Python сервис камер запущен');
}

// Функция остановки Python сервиса
function stopPythonService() {
    if (pythonProcess && isPythonRunning) {
        console.log('Остановка Python сервиса...');
        
        // Сначала отправляем SIGTERM
        pythonProcess.kill('SIGTERM');
        
        // Ждем 3 секунды, затем принудительно завершаем
        setTimeout(() => {
            if (pythonProcess && !pythonProcess.killed) {
                console.log('Принудительное завершение Python процесса...');
                pythonProcess.kill('SIGKILL');
            }
        }, 3000);
        
        isPythonRunning = false;
    }
}

// Запускаем Python сервис при старте
startPythonService();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Получен сигнал SIGINT, останавливаем сервер...');
    stopPythonService();
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

process.on('SIGTERM', () => {
    console.log('Получен сигнал SIGTERM, останавливаем сервер...');
    stopPythonService();
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

// API endpoints - проксируем к Python сервису
const PYTHON_SERVICE_URL = 'http://localhost:5000';

// Прокси для всех API запросов к камерам
app.use('/api/cameras', async (req, res) => {
      try {
        const response = await fetch(`${PYTHON_SERVICE_URL}${req.url}`, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
        });
        
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Ошибка проксирования запроса к Python сервису:', error);
    res.status(500).json({ 
            error: 'Ошибка подключения к сервису камер',
            details: error.message 
    });
  }
});

app.use('/api/camera', async (req, res) => {
  try {
        const response = await fetch(`${PYTHON_SERVICE_URL}${req.url}`, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
        });
        
        const data = await response.json();
        res.status(response.status).json(data);
  } catch (error) {
        console.error('Ошибка проксирования запроса к Python сервису:', error);
    res.status(500).json({
            error: 'Ошибка подключения к сервису камер',
      details: error.message
    });
  }
});

// Статус сервера
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        python_service: isPythonRunning ? 'running' : 'stopped',
        timestamp: new Date().toISOString()
    });
});

// WebSocket для стрима камер (прокси к Python сервису)
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('WebSocket клиент подключен');

    // Создаем HTTP запрос к Python сервису для стрима
    const streamRequest = async () => {
  try {
            const response = await fetch(`${PYTHON_SERVICE_URL}/api/cameras/stream`);
            const reader = response.body;
            
            reader.on('data', (chunk) => {
                const data = chunk.toString();
                const lines = data.split('\n');
    
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
      try {
                            const jsonData = JSON.parse(line.slice(6));
                            ws.send(JSON.stringify(jsonData));
                        } catch (e) {
                            // Игнорируем ошибки парсинга
                        }
                    }
                }
            });
            
            reader.on('error', (error) => {
                console.error('Ошибка чтения стрима:', error);
                ws.close();
            });
            
  } catch (error) {
            console.error('Ошибка подключения к стриму:', error);
            ws.close();
        }
    };
    
    streamRequest();
    
    ws.on('close', () => {
        console.log('WebSocket клиент отключен');
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Node.js сервер запущен на порту ${PORT}`);
    console.log(`Python сервис камер будет доступен на порту 5000`);
}); 