const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

const storeFile = () => path.join(app.getPath('userData'), 'pages.json');

const DEFAULT_DATA = {
  pages: [
    { id: 'hm-web', name: 'Hauge Maskin', url: 'https://www.haugemaskin.no', color: '#e2001a', group: 'Hauge Maskin' },
    { id: 'gmail', name: 'E-post', url: 'https://mail.google.com', color: '#ea4335', group: 'Verktøy' },
    { id: 'kalender', name: 'Kalender', url: 'https://calendar.google.com', color: '#4285f4', group: 'Verktøy' },
    { id: 'altinn', name: 'Altinn', url: 'https://www.altinn.no', color: '#0062ba', group: 'Offentleg' },
    { id: 'brreg', name: 'Brønnøysund', url: 'https://www.brreg.no', color: '#1a7f5a', group: 'Offentleg' },
    { id: 'yr', name: 'Yr – vêr', url: 'https://www.yr.no', color: '#00b9f1', group: 'Verktøy' }
  ],
  settings: { activeId: 'hm-web' }
};

function readData() {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.pages)) throw new Error('ugyldig format');
    data.settings = data.settings || {};
    return data;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function writeData(data) {
  fs.writeFileSync(storeFile(), JSON.stringify(data, null, 2), 'utf8');
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d0d0f',
    frame: false,
    show: false,
    title: 'Hauge Maskin',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const sendState = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state', { maximized: mainWindow.isMaximized() });
    }
  };
  mainWindow.on('maximize', sendState);
  mainWindow.on('unmaximize', sendState);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Lenker som prøver å opne nytt vindu frå ein webview -> opne i standardnettlesar
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('data:load', () => readData());
ipcMain.handle('data:save', (_e, data) => writeData(data));
ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url));

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow && mainWindow.close());

ipcMain.handle('data:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Eksporter sider',
    defaultPath: 'hauge-maskin-sider.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, JSON.stringify(readData(), null, 2), 'utf8');
  return true;
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer sider',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!Array.isArray(data.pages)) return null;
    writeData(data);
    return data;
  } catch {
    return null;
  }
});
