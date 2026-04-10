/**
 * Audio Device Manager — detect and route to headphones/speakers.
 *
 * Uses navigator.mediaDevices.enumerateDevices() to find audio outputs
 * and AudioContext.setSinkId() to route monitoring to a specific device.
 *
 * This enables DJ-style cue/monitor split:
 * - Main output (gainNode → MediaStreamDestination) → Stream (Twitch)
 * - Monitor output (monitorGain → audioCtx.destination) → Headphones or speakers
 *
 * setSinkId() is supported in Chrome 110+ and Electron (Chromium-based).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioOutputDevice {
  deviceId: string
  label: string
  isDefault: boolean
  isHeadphone: boolean // heuristic-based detection
}

type DeviceChangeCallback = (devices: AudioOutputDevice[]) => void

// ---------------------------------------------------------------------------
// Headphone detection heuristics
// ---------------------------------------------------------------------------

const HEADPHONE_KEYWORDS = [
  'headphone', 'headset', 'earphone', 'earbud', 'airpod', 'airpods',
  'beats', 'bose', 'sony wh', 'sony wf', 'jabra', 'sennheiser',
  'bluetooth', 'bt audio', 'wireless', 'external headphone',
  'usb audio', 'usb headset', 'usb-c', 'jbl', 'marshall', 'audio-technica',
  'akg', 'beyerdynamic', 'plantronics', 'poly', 'skullcandy', 'razer',
  'steelseries', 'hyperx', 'corsair', 'logitech g', 'astro',
]

function isLikelyHeadphone(label: string): boolean {
  if (!label) return false
  const lower = label.toLowerCase()
  // macOS reports wired headphones as "External Headphones"
  if (lower.includes('external')) return true
  return HEADPHONE_KEYWORDS.some(kw => lower.includes(kw))
}

// ---------------------------------------------------------------------------
// Audio Device Manager (singleton)
// ---------------------------------------------------------------------------

class AudioDeviceManager {
  private devices: AudioOutputDevice[] = []
  private listeners: Set<DeviceChangeCallback> = new Set()
  private initialized = false

  /**
   * Initialize device enumeration. Must be called after user gesture
   * (microphone permission may be needed to get device labels).
   */
  async init(): Promise<AudioOutputDevice[]> {
    if (this.initialized) return this.devices

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      // Request audio permission to get device labels (browsers hide labels without permission)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Immediately stop — we only needed it to unlock device labels
        stream.getTracks().forEach(t => t.stop())
      } catch {
        // Permission denied or not available — device labels may be empty
        console.warn('[AudioDevices] Microphone permission not granted — device labels may be unavailable')
      }

      // Listen for device changes (plug/unplug headphones, bluetooth connect/disconnect)
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.refresh()
      })
    }

    this.initialized = true
    return this.refresh()
  }

  /** Refresh the device list */
  async refresh(): Promise<AudioOutputDevice[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      this.devices = []
      return this.devices
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const outputs = allDevices.filter(d => d.kind === 'audiooutput')

      // Filter out the synthetic "default" entry — we'll mark the real default
      const nonDefault = outputs.filter(d => d.deviceId !== 'default')
      const hasMultipleOutputs = nonDefault.length > 1

      this.devices = outputs.map(d => {
        const label = d.label || (d.deviceId === 'default' ? 'Default' : `Output ${d.deviceId.slice(0, 8)}`)
        let headphone = isLikelyHeadphone(label)

        // If multiple outputs detected and this is NOT the built-in speaker,
        // it's likely an external device (headphones, bluetooth, USB audio)
        if (!headphone && hasMultipleOutputs && d.deviceId !== 'default') {
          const lower = label.toLowerCase()
          const isBuiltIn = lower.includes('built-in') || lower.includes('internal') || lower.includes('speaker')
          if (!isBuiltIn) headphone = true
        }

        return { deviceId: d.deviceId, label, isDefault: d.deviceId === 'default', isHeadphone: headphone }
      })

      // Notify listeners
      this.listeners.forEach(cb => cb(this.devices))
    } catch (e) {
      console.warn('[AudioDevices] Failed to enumerate:', e)
    }

    return this.devices
  }

  /** Get current device list */
  getDevices(): AudioOutputDevice[] {
    return this.devices
  }

  /** Check if any headphone-like device is connected */
  hasHeadphones(): boolean {
    return this.devices.some(d => d.isHeadphone)
  }

  /** Get the first detected headphone device */
  getHeadphone(): AudioOutputDevice | null {
    return this.devices.find(d => d.isHeadphone) || null
  }

  /**
   * Route an AudioContext's output to a specific device.
   * Uses the experimental setSinkId API (Chrome 110+, Electron).
   * Returns true if successful, false if not supported.
   */
  async routeToDevice(audioCtx: AudioContext, deviceId: string): Promise<boolean> {
    try {
      // setSinkId is experimental — check if available
      if ('setSinkId' in audioCtx && typeof (audioCtx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId === 'function') {
        await (audioCtx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId)
        return true
      }
      console.warn('[AudioDevices] setSinkId not supported in this browser')
      return false
    } catch (e) {
      console.warn('[AudioDevices] Failed to route to device:', e)
      return false
    }
  }

  /** Route to the default system output */
  async routeToDefault(audioCtx: AudioContext): Promise<boolean> {
    return this.routeToDevice(audioCtx, '')
  }

  /** Subscribe to device changes */
  onChange(callback: DeviceChangeCallback): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

// Singleton
export const audioDevices = new AudioDeviceManager()
