// File: electron/main/index.ts
// Electron main process - TaxFlow Pro

import { app, BrowserWindow, ipcMain, session, nativeTheme } from 'electron';
import path from 'path';
import { initDatabase } from './database';
import { registerClientHandlers } from './ipc/clientHandlers';
import { registerReturnHandlers } from './ipc/returnHandlers';
import { registerAuthHandlers } from './ipc/authHandlers';
import { registerDocumentHandlers } from './ipc/documentHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { setupLogger } from './logger';
import { ensureAppDirectories } from './utils/appDirs';

const logger = setupLogger('main');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  logger.info('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    backgroundColor: '#0F1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0F1117',
      symbolColor: '#E8EAF0',
      height: 38,
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: !isDev,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  // Load the renderer
  if (isDev) {
    await mainWindow.loadURL('http://localhost:3333');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, '../../dist/renderer/index.html')
    );
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    logger.info('Main window shown');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Security: prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = isDev
      ? ['http://localhost:3333']
      : [`file://${path.join(__dirname, '../../dist/renderer')}`];
    const parsedUrl = new URL(url);
    if (!allowedOrigins.some((origin) => url.startsWith(origin))) {
      logger.warn(`Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });
}

async function initialize(): Promise<void> {
  logger.info('TaxFlow Pro starting up...');

  try {
    // Ensure app data directories exist
    await ensureAppDirectories();

    // Initialize database
    await initDatabase();
    logger.info('Database initialized');

    // Register all IPC handlers
    registerAuthHandlers();
    registerClientHandlers();
    registerReturnHandlers();
    registerDocumentHandlers();
    registerSettingsHandlers();
    logger.info('IPC handlers registered');

    // Create the main window
    await createWindow();
  } catch (error) {
    logger.error('Initialization failed:', error);
    app.quit();
  }
}

// App lifecycle
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle certificate errors in dev
if (isDev) {
  app.on('certificate-error', (event, _webContents, _url, _error, _cert, callback) => {
    event.preventDefault();
    callback(true);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  app.quit();
});

export { mainWindow };
