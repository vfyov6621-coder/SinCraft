// ==========================================
// SinCraft — Electron Main Process
// ==========================================

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn, ChildProcess } = require('child_process');

const tailscale = require('./tailscale');

// State
let mainWindow = null;
let gameServerProcess = null;
let gameServerPort = 3003;
let tray = null;

const isDev = !process.env.ELECTRON_IS_PACKAGED;
const isMac = process.platform === 'darwin';

// ==========================================
// Determine path to the static export
// ==========================================
function getStaticPath() {
  if (isDev) {
    // In dev, try the `out/` directory from Next.js static export
    return path.join(__dirname, '..', 'out');
  }
  // In production (packaged), use resources
  return path.join(process.resourcesPath, 'app');
}

// ==========================================
// Create main window
// ==========================================
function createWindow() {
  const staticPath = getStaticPath();
  const indexPath = path.join(staticPath, 'index.html');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'SinCraft',
    backgroundColor: '#0a0e17',
    show: false, // show after ready-to-show
    autoHideMenuBar: true,
    frame: false, // frameless for game feel
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for WebGL
      webgl: true,
    },
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Load the static export
  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('Failed to load index.html:', err);
    // Show error in a dialog
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'SinCraft — Load Error',
      `Could not load the application.\n\nPath: ${indexPath}\n\nPlease run "npm run build:electron" first to generate the static export.`
    );
    app.quit();
  });

  // Window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    stopGameServer();
  });

  // Create tray icon
  createTray();
}

// ==========================================
// System tray (optional)
// ==========================================
function createTray() {
  try {
    // Create a simple 16x16 green icon as a buffer
    const icon = nativeImage.createFromBuffer(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4y2NgoDZw6Hh' +
        'AEYIJ5HxkGAbGJoxkDDDMwMMzAzMIMFqkg0MFAyMDKIMTAzMBiIMTBgY2A6S3IBsQb' +
        'dANmBsYGdi5WBnYGxgZmBsYGZg7WBjYG5g7WBnYG9g4WAGIOxg7mBjYG5g4GBi4GB' +
        'gYuBgYGNgYWBkYGNgZGBkYG1g8OBgYOLgYGBi4GBgYuBkYGbgZGBmYGdgZGBm4GZgZ' +
        '2BgYGdgZWBkYGVgZWBlYG1g5OBkYOTg5GDk4ORgZODkYGRgZOBkYGFgYWBlYGJgYmB' +
        'iYGJgYWBiYGFgYWBiYGFgYmBiYGHgYmBh4GJgYeBiYGHgYGBg4GBgYGBgYGBgYGBgY' +
        'GBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGDg/xkYGBh4GfgXIAABjJV0lL5+rPAAAAA' +
        'ElFTkSuQmCC',
        'base64'
      )
    );
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'SinCraft', enabled: false },
      { type: 'separator' },
      { label: 'Show Window', click: () => mainWindow?.show() },
      {
        label: 'Game Server',
        submenu: [
          { label: 'Start Server', click: () => startGameServer(gameServerPort) },
          { label: 'Stop Server', click: () => stopGameServer() },
        ],
      },
      { type: 'separator' },
      { label: 'Quit', click: () => { stopGameServer(); app.quit(); } },
    ]);
    tray.setToolTip('SinCraft');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());
  } catch (e) {
    console.log('Tray creation skipped:', e.message);
  }
}

// ==========================================
// Game Server Management
// ==========================================
function startGameServer(port) {
  if (gameServerProcess) {
    return { success: false, error: 'Server already running' };
  }

  gameServerPort = port || 3003;
  const serverScript = path.join(__dirname, 'game-server-node.js');

  try {
    gameServerProcess = spawn(process.execPath, [serverScript], {
      env: { ...process.env, PORT: String(gameServerPort) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    gameServerProcess.on('error', (err) => {
      console.error('Game server error:', err);
      gameServerProcess = null;
    });

    gameServerProcess.on('exit', (code) => {
      console.log(`Game server exited with code ${code}`);
      gameServerProcess = null;
    });

    // Log output
    gameServerProcess.stdout?.on('data', (data) => {
      console.log(`[GameServer] ${data.toString().trim()}`);
    });
    gameServerProcess.stderr?.on('data', (data) => {
      console.error(`[GameServer] ${data.toString().trim()}`);
    });

    return { success: true, port: gameServerPort };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function stopGameServer() {
  if (gameServerProcess) {
    try {
      gameServerProcess.kill('SIGTERM');
    } catch (e) {
      try {
        gameServerProcess.kill();
      } catch (e2) { /* ignore */ }
    }
    gameServerProcess = null;
  }
}

// ==========================================
// IPC Handlers
// ==========================================

// --- Window Controls ---
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  stopGameServer();
  app.quit();
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

// --- App Info ---
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:quit', () => {
  stopGameServer();
  app.quit();
});

// --- Tailscale ---
ipcMain.handle('tailscale:is-installed', async () => {
  return tailscale.isInstalled();
});

ipcMain.handle('tailscale:status', async () => {
  return tailscale.getStatus();
});

ipcMain.handle('tailscale:get-ip', async () => {
  return tailscale.getIP();
});

ipcMain.handle('tailscale:get-peers', async () => {
  return tailscale.getPeers();
});

// --- Game Server ---
ipcMain.handle('server:start', async (_event, port) => {
  return startGameServer(port);
});

ipcMain.handle('server:stop', async () => {
  stopGameServer();
  return { success: true };
});

ipcMain.handle('server:get-status', async () => {
  return {
    running: gameServerProcess !== null,
    port: gameServerPort,
  };
});

// ==========================================
// App Lifecycle
// ==========================================

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopGameServer();
  if (!isMac) {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopGameServer();
});
