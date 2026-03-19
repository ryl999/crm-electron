const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 数据存储路径
const dataPath = path.join(app.getPath('userData'), 'data.json');

let win;

// 创建窗口
function createWindow() {

  win = new BrowserWindow({

    width: 1200,
    height: 800,

    minWidth: 1000,
    minHeight: 650,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }

  });

  win.loadFile('index.html');

}

// 初始化
app.whenReady().then(() => {

  // 如果数据文件不存在则创建
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(
      dataPath,
      JSON.stringify(
        { customers: [], statusList: [], reminderRules: {} },
        null,
        2
      )
    );
  }

  createWindow();

});

// 关闭逻辑
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC：读取数据
ipcMain.handle('load-data', async () => {
  const raw = fs.readFileSync(dataPath, 'utf-8');
  return JSON.parse(raw);
});

// IPC：保存数据
ipcMain.handle('save-data', async (event, data) => {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  return true;
});