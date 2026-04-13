const { app, BrowserWindow, shell, ipcMain, dialog, nativeTheme } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const net = require('net')

let autoUpdater = null
try {
  const { autoUpdater: au } = require('electron-updater')
  autoUpdater = au
} catch {
  // electron-updater not available in dev
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const isDev = !app.isPackaged
const WEB_PORT = isDev ? 3030 : 3030 // same port in dev and prod
const WEB_URL = `http://localhost:${WEB_PORT}`

let mainWindow = null
let nextServer = null

// ---------------------------------------------------------------------------
// Next.js standalone server (production only)
// ---------------------------------------------------------------------------

function startNextServer() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // In dev mode, the Next.js dev server is started by concurrently
      resolve()
      return
    }

    // Production: start the Next.js standalone server from extraResources
    const appPath = path.join(process.resourcesPath, 'app')
    const serverPath = path.join(appPath, 'web', 'server.js')

    const env = {
      ...process.env,
      PORT: String(WEB_PORT),
      HOSTNAME: 'localhost',
      NODE_ENV: 'production',
    }

    // Copy .env to the server directory if it exists
    const envPath = path.join(app.getPath('userData'), '.env')
    const fs = require('fs')
    if (fs.existsSync(envPath)) {
      env.DOTENV_CONFIG_PATH = envPath
    }

    nextServer = spawn(process.execPath.replace(/Electron/, 'node').replace(/electron/, 'node'),
      [serverPath], {
      cwd: path.join(appPath, 'web'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Fallback: use node from PATH if the above doesn't work
    if (!nextServer.pid) {
      nextServer = spawn('node', [serverPath], {
        cwd: path.join(appPath, 'web'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }

    nextServer.stdout.on('data', (data) => {
      const msg = data.toString()
      console.log('[Next.js]', msg)
      if (msg.includes('Ready') || msg.includes('started') || msg.includes('listening')) {
        resolve()
      }
    })

    nextServer.stderr.on('data', (data) => {
      console.error('[Next.js Error]', data.toString())
    })

    nextServer.on('error', (err) => {
      console.error('[Next.js] Failed to start:', err)
      reject(err)
    })

    nextServer.on('exit', (code) => {
      console.log('[Next.js] Server exited with code:', code)
      nextServer = null
    })

    // Timeout: if server doesn't report ready in 15s, try connecting anyway
    setTimeout(() => resolve(), 15000)
  })
}

// ---------------------------------------------------------------------------
// Wait for the web server to be accessible
// ---------------------------------------------------------------------------

function waitForServer(port, maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let retries = 0
    function tryConnect() {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      socket.on('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.on('timeout', () => {
        socket.destroy()
        retry()
      })
      socket.on('error', () => {
        retry()
      })
      socket.connect(port, 'localhost')
    }
    function retry() {
      if (++retries >= maxRetries) {
        reject(new Error(`Server not ready after ${maxRetries} retries`))
        return
      }
      setTimeout(tryConnect, 500)
    }
    tryConnect()
  })
}

// ---------------------------------------------------------------------------
// Create main window
// ---------------------------------------------------------------------------

function createWindow() {
  // Force dark mode
  nativeTheme.themeSource = 'dark'

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0a0a14',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local video files
    },
    show: false,
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
  })

  // Show when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Load the Next.js app
  mainWindow.loadURL(WEB_URL)

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Open DevTools in dev mode (suppress Autofill errors)
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    // Suppress Chrome-specific DevTools protocol errors (Autofill.enable etc.)
    mainWindow.webContents.on('console-message', (_e, level, message) => {
      if (level === 3 && message.includes('Autofill.')) return // suppress
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// IPC Handlers — native file system access
// ---------------------------------------------------------------------------

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Video Folder',
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:openFiles', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Video Files',
    filters: filters || [
      { name: 'Video Files', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov'] },
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'] },
    ],
  })
  if (result.canceled) return []
  return result.filePaths
})

ipcMain.handle('dialog:saveFile', async (_, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Recording',
    defaultPath: defaultName || 'dj-mix.webm',
    filters: [
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled) return null
  return result.filePath
})

ipcMain.handle('fs:readFile', async (_, filePath) => {
  const fs = require('fs')
  return fs.readFileSync(filePath)
})

ipcMain.handle('app:getPath', (_, name) => {
  return app.getPath(name)
})

ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:isPackaged', () => {
  return app.isPackaged
})

ipcMain.handle('app:checkForUpdate', async () => {
  if (!autoUpdater) return { available: false }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { available: !!result?.updateInfo, version: result?.updateInfo?.version }
  } catch {
    return { available: false }
  }
})

ipcMain.handle('app:installUpdate', () => {
  if (autoUpdater) autoUpdater.quitAndInstall()
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Set app name for dock tooltip (overrides "Electron" in dev mode)
app.setName('videoDJ.Studio')

// Prevent multiple instances — if another instance is already running, focus it
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  // Set dock icon to videoDJ logo (macOS dev mode)
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, '..', '..', 'resources', 'icon.png')
    try { app.dock.setIcon(iconPath) } catch {}
  }
  try {
    if (!isDev) {
      await startNextServer()
    }
    await waitForServer(WEB_PORT)
    createWindow()
  } catch (err) {
    console.error('Failed to start:', err)
    // Try to create window anyway — user might have started web dev server manually
    createWindow()
  }

  // Auto-update (production only)
  if (!isDev && autoUpdater) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      console.log('[Update] Available:', info.version)
      mainWindow?.webContents.send('update:available', info.version)
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Update] Downloaded:', info.version)
      mainWindow?.webContents.send('update:downloaded', info.version)
    })

    autoUpdater.on('error', (err) => {
      console.error('[Update] Error:', err)
    })

    // Check for updates every 4 hours
    autoUpdater.checkForUpdates().catch(() => {})
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 4 * 60 * 60 * 1000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Kill the Next.js server on quit
  if (nextServer) {
    nextServer.kill()
    nextServer = null
  }
})
