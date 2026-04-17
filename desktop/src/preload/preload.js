const { contextBridge, ipcRenderer } = require('electron')

/**
 * Preload script — exposes native capabilities to the renderer process
 * via window.electronAPI, keeping contextIsolation enabled.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // File system dialogs
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
  saveFile: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),

  // Read file from native FS (returns Buffer)
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),

  // App info
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),

  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_, version) => cb(version)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_, version) => cb(version)),

  // Music library — Electron's native FS path (replaces showDirectoryPicker
  // so a page refresh/reboot restores the library without prompts).
  library: {
    pick: () => ipcRenderer.invoke('library:pick'),
    restore: () => ipcRenderer.invoke('library:restore'),
    forget: () => ipcRenderer.invoke('library:forget'),
  },

  // Platform info
  platform: process.platform,
  isElectron: true,
})
