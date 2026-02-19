const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const FileScanner = require('./fileScanner');

let mainWindow;

// 读取设置
function getSettings() {
    try {
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(require('electron').app.getPath('userData'), 'settings.json');
        
        console.log('尝试从文件读取设置:', settingsPath);
        
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            console.log('从文件读取到的设置:', settings);
            return settings;
        } else {
            console.log('设置文件不存在，尝试从localStorage读取');
        }
    } catch (error) {
        console.error('读取设置失败:', error);
    }
    
    // 尝试从localStorage读取（兼容旧版本）
    try {
        const localStorage = require('electron-localstorage');
        const savedSettings = localStorage.getItem('wechatFileManagerSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            console.log('从localStorage读取到的设置:', settings);
            return settings;
        } else {
            console.log('localStorage中没有设置');
        }
    } catch (error) {
        console.error('从localStorage读取设置失败:', error);
    }
    
    console.log('返回默认设置');
    return {};
}

// 初始化文件扫描器
const settings = getSettings();
const fileScanner = new FileScanner(
    settings.wechatPath || '',
    settings.useDefaultPaths !== false
);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true, // 隐藏菜单栏
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC通信处理
ipcMain.on('scan-wechat-files', async (event) => {
  console.log('收到扫描微信文件请求');
  
  try {
    const files = await fileScanner.scanWeChatFiles();
    // 转换文件大小为可读格式
    const formattedFiles = files.map(file => ({
      ...file,
      size: formatFileSize(file.size),
      modifyTime: file.modifyTime.toISOString().split('T')[0]
    }));
    
    event.reply('scan-complete', formattedFiles);
    console.log('扫描完成，返回文件数:', formattedFiles.length);
  } catch (error) {
    console.error('扫描失败:', error);
    event.reply('scan-error', error.message);
  }
});

ipcMain.on('search-files', (event, keyword) => {
  const results = fileScanner.searchFiles(keyword);
  const formattedResults = results.map(file => ({
    ...file,
    size: formatFileSize(file.size),
    modifyTime: file.modifyTime.toISOString().split('T')[0]
  }));
  event.reply('search-results', formattedResults);
});

ipcMain.on('filter-files', (event, type) => {
  const results = fileScanner.filterByType(type);
  const formattedResults = results.map(file => ({
    ...file,
    size: formatFileSize(file.size),
    modifyTime: file.modifyTime.toISOString().split('T')[0]
  }));
  event.reply('filter-results', formattedResults);
});

ipcMain.on('open-settings', (event) => {
  console.log('收到打开设置窗口请求');
  
  const { BrowserWindow } = require('electron');
  const path = require('path');
  
  const settingsWindow = new BrowserWindow({
    width: 800,
    height: 700,
    title: '设置 - 微信文件管理器',
    parent: mainWindow,
    modal: false,
    autoHideMenuBar: true, // 隐藏菜单栏
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  
  // 监听设置窗口关闭，重新扫描
  settingsWindow.on('closed', function() {
    if (mainWindow) {
      mainWindow.webContents.send('settings-updated');
    }
  });
});

// 监听设置更新
ipcMain.on('update-settings', (event, newSettings) => {
  console.log('收到设置更新:', newSettings);
  
  // 更新文件扫描器设置
  fileScanner.setCustomPath(newSettings.wechatPath || '');
  fileScanner.setUseDefaultPaths(newSettings.useDefaultPaths !== false);
  
  console.log('文件扫描器设置已更新:');
  console.log('  自定义路径:', newSettings.wechatPath || '');
  console.log('  扫描默认路径:', newSettings.useDefaultPaths !== false);
  
  // 保存设置到文件
  try {
    const fs = require('fs');
    const path = require('path');
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
    console.log('设置已保存到:', settingsPath);
  } catch (error) {
    console.error('保存设置失败:', error);
  }
});

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}