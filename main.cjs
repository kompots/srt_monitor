const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const { list } = require('postcss');

let win;
let tray;

function createWindow() {
  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');

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
  // const webServerProcess = exec('npx http-server dist', { shell: true });

  // webServerProcess.stdout?.pipe(process.stdout);
  // webServerProcess.stderr?.pipe(process.stderr);
  // console.log("Webserver shell executed")
  webServerProcess = spawn('npx', ['http-server', 'dist'], {
    stdio: 'inherit',
    shell: true,
    windowsHide: false
  });

  webServerProcess.on('error', (err) => {
    console.error('Failed to start webserver:', err);
  });
}

async function startApiListener() {
  console.log("Starting to build API server with websocket")
  await app.whenReady();
  const basePath = app.resourcesPath || app.getAppPath() + '/dist/win-unpacked/resources/';
  const listenerPath = path.join(
    basePath,
    'app.asar.unpacked',
    'src',
    'listener.mjs'
  );
  // const listenerPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'listener.mjs');
  console.log("Listener path: ", listenerPath)
  const child = spawn('node', ['--experimental-modules', listenerPath], {
    stdio: 'inherit',
    shell: true,
    windowsHide: false
  });

}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.whenReady().then(() => {
  startApiListener().catch(console.error);
  // startWebServer();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Simulate clicking the "Quit" tray icon item after a delay
  // setTimeout(() => {
  //   console.log('Simulating quit from tray icon via internal timeout...');
  //   app.isQuiting = true; // Important for our quit logic in 'close' event of window

  //   console.log('Terminating processes (simulated tray quit)...');
  //   if (webServerProcess) {
  //     try {
  //       process.kill(webServerProcess.pid);
  //       console.log('Web server process termination signal sent.');
  //     } catch (e) {
  //       console.error('Error killing web server process:', e);
  //     }
  //   }
  //   if (apiListenerProcess) {
  //     try {
  //       process.kill(apiListenerProcess.pid);
  //       console.log('API listener process termination signal sent.');
  //     } catch (e) {
  //       console.error('Error killing API listener process:', e);
  //     }
  //   }
  //   // Give a moment for processes to be killed before quitting app
  //   setTimeout(() => {
  //     app.quit();
  //     console.log('app.quit() called.');
  //   }, 1000); // 1 second delay before app.quit()
  // }, 10000); // Simulate quit after 10 seconds
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

