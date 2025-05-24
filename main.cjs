const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win;
let tray;

function createWindow() {
  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');

  console.log('Loading file:', indexPath);
  if (!fs.existsSync(indexPath)) {
    console.error('Missing build files. Run "npm run build" first.');
    app.quit();
    return;
  }

  win = new BrowserWindow({
    width: 410,
    height: 665,
    autoHideMenuBar: false,
    show: false, // Start hidden; show after ready-to-show event
    webPreferences: {
      contextIsolation: true,
    }
  });

  win.loadFile(indexPath);

  // Show window when ready (avoid flicker)
  win.once('ready-to-show', () => {
    win.show();
  });

  // When user tries to close window, hide it instead of quitting
  win.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
    return false;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'dist', 'icon.ico'); // Use your icon here
  console.log('Loading tray icon:', iconPath);
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        win.show();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('SRT App');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    win.isVisible() ? win.hide() : win.show();
  });
}

function startWebServer() {
  const webServer = spawn('npm', ['http-server', 'dist'], {
    stdio: 'inherit',
    shell: true,
    windowsHide: true
  });

  webServer.on('error', (err) => {
    console.error('Failed to start webserver:', err);
  });
}

function startApiListener() {
  const listenerPath = path.join(__dirname, 'src', 'listener.mjs');

  const child = spawn('node', [listenerPath], {
    stdio: 'inherit',
    shell: true
  });

  child.on('error', (err) => {
    console.error('Failed to start listener:', err);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.whenReady().then(() => {
  startApiListener();
  startWebServer();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows closed (optional, depends on your app behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

