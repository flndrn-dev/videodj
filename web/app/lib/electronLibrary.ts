/**
 * Electron native library bridge
 *
 * When we're running inside the Desktop App, the renderer gets its
 * music folder from Electron's native filesystem instead of the
 * browser's showDirectoryPicker(). The path is persisted in the
 * Electron userData dir so a refresh / reboot reconnects silently
 * with zero prompts.
 *
 * All the heavy lifting (dialog, fs.readdir, path persistence) lives
 * in the main process (desktop/src/main/main.js). This file is just
 * the typed façade the web renderer imports.
 */

export type ElectronFileRef = {
  name: string
  path: string   // absolute path on disk
  size: number
  mtime: number
  relPath: string
}

export type ElectronLibrary = {
  rootPath: string
  files: ElectronFileRef[]
  missing?: boolean // folder was previously picked but no longer exists
}

type ElectronAPI = {
  isElectron: true
  library?: {
    pick: () => Promise<ElectronLibrary | null>
    restore: () => Promise<ElectronLibrary | null>
    forget: () => Promise<boolean>
  }
}

function getAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI
  if (!api || !api.isElectron || !api.library) return null
  return api
}

export function isElectronNativeLibraryAvailable(): boolean {
  return getAPI() !== null
}

export async function pickElectronLibrary(): Promise<ElectronLibrary | null> {
  const api = getAPI()
  if (!api?.library) return null
  return api.library.pick()
}

export async function restoreElectronLibrary(): Promise<ElectronLibrary | null> {
  const api = getAPI()
  if (!api?.library) return null
  return api.library.restore()
}

export async function forgetElectronLibrary(): Promise<void> {
  const api = getAPI()
  if (!api?.library) return
  await api.library.forget()
}

/**
 * Build a playable video URL for an Electron file. We rely on
 * webSecurity:false (already set in main.js BrowserWindow config) so
 * file:// URLs work from the https:// renderer context.
 */
export function electronFileUrl(absPath: string): string {
  // Normalize Windows backslashes for file:// scheme
  const normalized = absPath.replace(/\\/g, '/')
  // Encode non-ASCII, keep path separators intact
  return `file://${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}
