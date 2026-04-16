const { app, BrowserWindow, shell, ipcMain, dialog, nativeTheme } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const net = require('net')
const fs = require('fs')

let autoUpdater = null
try {
  const { autoUpdater: au } = require('electron-updater')
  autoUpdater = au
} catch {}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const isDev = !app.isPackaged
const LOCAL_PORT = 3030
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`
const PRODUCTION_URL = 'https://app.videodj.studio'
const PROTOCOL = isDev ? 'videodj-dev' : 'videodj'

let mainWindow = null
let nextServer = null
let baseUrl = PRODUCTION_URL // set once we know whether local server is up
let pendingDeepLink = null   // deep link captured before the window is ready

// ---------------------------------------------------------------------------
// Deep link handling (videodj://auth/verify?token=…)
// ---------------------------------------------------------------------------

function extractDeepLink(argv) {
  if (!Array.isArray(argv)) return null
  return argv.find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`)) || null
}

function handleDeepLink(rawUrl) {
  if (!rawUrl) return
  let parsed
  try { parsed = new URL(rawUrl) } catch { return }

  // Only the auth/verify path is supported today — ignore anything else to
  // avoid turning the protocol handler into an open redirector.
  const path = (parsed.host + parsed.pathname).replace(/\/+$/, '')
  if (path !== 'auth/verify') return

  const token = parsed.searchParams.get('token')
  if (!token) return

  const target = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.loadURL(target)
  } else {
    // Window not ready yet — stash and let createWindow pick it up
    pendingDeepLink = target
  }
}

// ---------------------------------------------------------------------------
// Next.js standalone server (production)
// ---------------------------------------------------------------------------

function startNextServer() {
  return new Promise((resolve) => {
    if (isDev) { resolve(); return }

    const appPath = path.join(process.resourcesPath, 'app')
    const serverJs = path.join(appPath, 'web', 'server.js')

    if (!fs.existsSync(serverJs)) {
      console.log('[Next.js] No bundled server — will use production URL')
      resolve()
      return
    }

    const env = {
      ...process.env,
      PORT: String(LOCAL_PORT),
      HOSTNAME: 'localhost',
      NODE_ENV: 'production',
    }

    // Load .env from userData
    const envPath = path.join(app.getPath('userData'), '.env')
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
      }
    }

    console.log('[Next.js] Starting standalone server:', serverJs)

    // Spawn node with the correct working directory
    nextServer = spawn('node', [serverJs], {
      cwd: path.join(appPath, 'web'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    nextServer.stdout.on('data', (data) => {
      const msg = data.toString()
      console.log('[Next.js]', msg.trim())
      if (msg.includes('Ready') || msg.includes('started') || msg.includes('listening')) {
        resolve()
      }
    })

    nextServer.stderr.on('data', (data) => {
      console.error('[Next.js ERR]', data.toString().trim())
    })

    nextServer.on('error', (err) => {
      console.error('[Next.js] Spawn failed:', err.message)
      nextServer = null
      resolve() // fall through to production URL
    })

    nextServer.on('exit', (code) => {
      console.log('[Next.js] Exited with code:', code)
      nextServer = null
    })

    // If server doesn't signal ready in 20s, resolve anyway
    setTimeout(resolve, 20000)
  })
}

// ---------------------------------------------------------------------------
// Check if local server is running
// ---------------------------------------------------------------------------

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(2000)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => { resolve(false) })
    socket.connect(port, 'localhost')
  })
}

function waitForServer(port, maxRetries = 40) {
  return new Promise((resolve, reject) => {
    let retries = 0
    function tryConnect() {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      socket.on('connect', () => { socket.destroy(); resolve() })
      socket.on('timeout', () => { socket.destroy(); retry() })
      socket.on('error', () => { retry() })
      socket.connect(port, 'localhost')
    }
    function retry() {
      if (++retries >= maxRetries) { reject(new Error('Server timeout')); return }
      setTimeout(tryConnect, 500)
    }
    tryConnect()
  })
}

// ---------------------------------------------------------------------------
// Create main window
// ---------------------------------------------------------------------------

function createWindow(url) {
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
      webSecurity: false,
    },
    show: false,
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
  })

  mainWindow.once('ready-to-show', () => { mainWindow.show() })
  mainWindow.loadURL(url)

  // If a deep link arrived before the window existed, process it now that it does.
  if (pendingDeepLink) {
    const deferred = pendingDeepLink
    pendingDeepLink = null
    handleDeepLink(deferred)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    if (linkUrl.startsWith('http://localhost') || linkUrl.includes('videodj.studio')) {
      return { action: 'allow' }
    }
    shell.openExternal(linkUrl)
    return { action: 'deny' }
  })

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Video Folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openFiles', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Video Files',
    filters: filters || [
      { name: 'Video Files', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov'] },
    ],
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('dialog:saveFile', async (_, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Recording',
    defaultPath: defaultName || 'dj-mix.webm',
    filters: [{ name: 'WebM Video', extensions: ['webm'] }],
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('fs:readFile', async (_, filePath) => fs.readFileSync(filePath))
ipcMain.handle('app:getPath', (_, name) => app.getPath(name))
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:isPackaged', () => app.isPackaged)

ipcMain.handle('app:checkForUpdate', async () => {
  if (!autoUpdater) return { available: false }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { available: !!result?.updateInfo, version: result?.updateInfo?.version }
  } catch { return { available: false } }
})

ipcMain.handle('app:installUpdate', () => {
  if (autoUpdater) autoUpdater.quitAndInstall()
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.setName('videoDJ.Studio')

// Register the custom protocol so the OS routes videodj:// links to us.
// On Windows/Linux the second arg is the path back to the executable.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// Deep link delivered as a launch arg (Windows/Linux cold start)
const initialDeepLink = extractDeepLink(process.argv)
if (initialDeepLink) pendingDeepLink = initialDeepLink

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows/Linux: deep link arrives as a command-line arg to a second instance
    const link = extractDeepLink(argv)
    if (link) handleDeepLink(link)

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// macOS: deep link delivered via open-url
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(path.join(__dirname, '..', '..', 'resources', 'icon.png')) } catch {}
  }

  let url = PRODUCTION_URL

  if (isDev) {
    // Dev mode — use local Next.js dev server
    url = LOCAL_URL
  } else {
    // Production — try to start bundled server, fall back to production URL
    try {
      await startNextServer()
      const localUp = await isPortOpen(LOCAL_PORT)
      if (!localUp && nextServer) {
        await waitForServer(LOCAL_PORT)
      }
      if (await isPortOpen(LOCAL_PORT)) {
        url = LOCAL_URL
        console.log('[App] Using local server:', url)
      } else {
        console.log('[App] Local server not available — using production:', url)
      }
    } catch {
      console.log('[App] Falling back to production URL:', url)
    }
  }

  baseUrl = url

  createWindow(url)

  // Auto-update
  if (!isDev && autoUpdater) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-available', (info) => mainWindow?.webContents.send('update:available', info.version))
    autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('update:downloaded', info.version))
    autoUpdater.on('error', () => {})
    autoUpdater.checkForUpdates().catch(() => {})
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (nextServer) { nextServer.kill(); nextServer = null }
})
