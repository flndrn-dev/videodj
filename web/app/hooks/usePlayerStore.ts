'use client'
import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  remixer: string
  genre: string
  language: string | null
  bpm: number
  key: string
  released: string
  duration: number
  timesPlayed: number
  thumbnail?: string
  file?: string
  /** Object URL or path to the video file */
  videoUrl?: string
}

export interface DeckState {
  track: Track | null
  playing: boolean
}

interface PlayerStore {
  // State
  deckA: DeckState
  deckB: DeckState
  crossfader: number
  playlist: Track[]
  library: Track[]
  languageFilter: string | null
  sidebarOpen: boolean
  autoplayActive: boolean
  automixActive: boolean
  automixQueue: Track[]

  // Derived helper
  activeDeck: () => 'A' | 'B'

  // Actions
  setAutoplay: (active: boolean) => void
  setAutomix: (active: boolean) => void
  setAutomixQueue: (queue: Track[]) => void
  setCrossfader: (v: number) => void
  loadTrack: (deck: 'A' | 'B', track: Track) => void
  play: (deck: 'A' | 'B') => void
  pause: (deck: 'A' | 'B') => void
  setLanguageFilter: (lang: string | null) => void
  buildPlaylist: () => void
  setLibrary: (tracks: Track[]) => void
  setSidebarOpen: (open: boolean) => void
  addToLibrary: (tracks: Track[]) => void
  setPlaylist: (tracks: Track[]) => void
  batchUpdateTracks: (updates: { id: string; changes: Partial<Track> }[]) => void
  updateTrack: (id: string, updates: Partial<Track>) => void
  deleteTrack: (id: string) => void
  ejectTrack: (deck: 'A' | 'B') => void
  cueTrack: (deck: 'A' | 'B') => void
  togglePlay: (deck: 'A' | 'B') => void
  incrementPlays: (id: string) => void
}

// ---------------------------------------------------------------------------
// Helper: format seconds to m:ss
// ---------------------------------------------------------------------------

export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Demo library
// ---------------------------------------------------------------------------

const DEMO_LIBRARY: Track[] = [
  { id: '1',  title: 'Zoutelande',            artist: 'BLØF ft. Geike Arnaert', album: '', remixer: '', genre: 'Pop', language: 'nl', bpm: 128, key: '5A', released: '2018', duration: 214, timesPlayed: 0, thumbnail: '' },
  { id: '2',  title: 'Blinding Lights',       artist: 'The Weeknd',              album: '', remixer: '', genre: 'Synthwave', language: 'en', bpm: 171, key: '6B', released: '2020', duration: 200, timesPlayed: 0, thumbnail: '' },
  { id: '3',  title: 'Afscheid',              artist: 'Suzan & Freek',           album: '', remixer: '', genre: 'Pop', language: 'nl', bpm: 120, key: '3A', released: '2019', duration: 198, timesPlayed: 0, thumbnail: '' },
  { id: '4',  title: 'Levitating',            artist: 'Dua Lipa',                album: '', remixer: '', genre: 'Disco', language: 'en', bpm: 103, key: '6B', released: '2020', duration: 203, timesPlayed: 0, thumbnail: '' },
  { id: '5',  title: 'Samen voor altijd',     artist: 'Nielson',                 album: '', remixer: '', genre: 'Pop', language: 'nl', bpm: 130, key: '4A', released: '2017', duration: 225, timesPlayed: 0, thumbnail: '' },
  { id: '6',  title: 'As It Was',             artist: 'Harry Styles',            album: '', remixer: '', genre: 'Pop', language: 'en', bpm: 174, key: '6B', released: '2022', duration: 167, timesPlayed: 0, thumbnail: '' },
  { id: '7',  title: 'Dansen aan het strand', artist: 'Het Goede Doel',          album: '', remixer: '', genre: 'Synth', language: 'nl', bpm: 126, key: '2A', released: '1986', duration: 210, timesPlayed: 0, thumbnail: '' },
  { id: '8',  title: 'Flowers',               artist: 'Miley Cyrus',             album: '', remixer: '', genre: 'Pop', language: 'en', bpm: 118, key: '8B', released: '2023', duration: 200, timesPlayed: 0, thumbnail: '' },
  { id: '9',  title: 'Vergeet me niet',       artist: 'André Hazes Jr.',         album: '', remixer: '', genre: 'Levenslied', language: 'nl', bpm: 132, key: '1A', released: '2019', duration: 192, timesPlayed: 0, thumbnail: '' },
  { id: '10', title: 'Anti-Hero',             artist: 'Taylor Swift',            album: '', remixer: '', genre: 'Pop', language: 'en', bpm: 160, key: '4B', released: '2022', duration: 200, timesPlayed: 0, thumbnail: '' },
]

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  deckA: { track: null, playing: false },
  deckB: { track: null, playing: false },
  crossfader: 50,
  playlist: [],
  library: DEMO_LIBRARY,
  languageFilter: null,
  sidebarOpen: false,
  autoplayActive: false,
  automixActive: false,
  automixQueue: [],

  setAutoplay: (active) => set({ autoplayActive: active }),
  setAutomix: (active) => set({ automixActive: active, automixQueue: active ? [] : [] }),
  setAutomixQueue: (queue) => set({ automixQueue: queue }),

  activeDeck: () => (get().crossfader <= 50 ? 'A' : 'B'),

  setCrossfader: (v) => set({ crossfader: v }),

  loadTrack: (deck, track) =>
    set(deck === 'A'
      ? { deckA: { track, playing: false } }
      : { deckB: { track, playing: false } }),

  play: (deck) =>
    set((s) =>
      deck === 'A'
        ? { deckA: { ...s.deckA, playing: true } }
        : { deckB: { ...s.deckB, playing: true } }),

  pause: (deck) =>
    set((s) =>
      deck === 'A'
        ? { deckA: { ...s.deckA, playing: false } }
        : { deckB: { ...s.deckB, playing: false } }),

  setLanguageFilter: (lang) => set({ languageFilter: lang }),

  buildPlaylist: () => {
    const { library, languageFilter } = get()
    const filtered = languageFilter
      ? library.filter((t) => t.language === languageFilter)
      : [...library]
    // Sort A-Z by title
    filtered.sort((a, b) => a.title.localeCompare(b.title))
    set({ playlist: filtered })
  },

  setLibrary: (tracks) => {
    const sorted = (tracks.length > 0 ? tracks : DEMO_LIBRARY)
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
    set({ library: sorted })
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addToLibrary: (tracks) =>
    set((s) => ({
      library: [...s.library, ...tracks].sort((a, b) => a.title.localeCompare(b.title)),
    })),

  setPlaylist: (tracks) => set({ playlist: tracks }),

  batchUpdateTracks: (updates) => {
    set((s) => {
      const libMap = new Map(s.library.map(t => [t.id, t]))
      for (const { id, changes } of updates) {
        const track = libMap.get(id)
        if (track) {
          if (changes.language) changes.language = changes.language.toUpperCase()
          libMap.set(id, { ...track, ...changes })
        }
      }
      const library = Array.from(libMap.values())
      const playlistIds = new Set(s.playlist.map(t => t.id))
      const playlist = s.playlist.map(t => libMap.get(t.id) || t).filter(t => playlistIds.has(t.id))
      return { library, playlist }
    })
  },

  updateTrack: (id, updates) => {
    // Always uppercase language
    if (updates.language !== undefined && updates.language) {
      updates.language = updates.language.toUpperCase()
    }
    set((s) => ({
      library: s.library.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      playlist: s.playlist.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))
  },

  deleteTrack: (id) =>
    set((s) => ({
      library: s.library.filter((t) => t.id !== id),
      playlist: s.playlist.filter((t) => t.id !== id),
    })),

  ejectTrack: (deck) =>
    set(deck === 'A'
      ? { deckA: { track: null, playing: false } }
      : { deckB: { track: null, playing: false } }),

  cueTrack: (deck) =>
    set((s) => {
      const d = deck === 'A' ? s.deckA : s.deckB
      // Pause and reset to start (video currentTime handled in component)
      return deck === 'A'
        ? { deckA: { ...d, playing: false } }
        : { deckB: { ...d, playing: false } }
    }),

  togglePlay: (deck) =>
    set((s) => {
      const d = deck === 'A' ? s.deckA : s.deckB
      return deck === 'A'
        ? { deckA: { ...d, playing: !d.playing } }
        : { deckB: { ...d, playing: !d.playing } }
    }),

  incrementPlays: (id) =>
    set((s) => ({
      library: s.library.map((t) => (t.id === id ? { ...t, timesPlayed: (t.timesPlayed || 0) + 1 } : t)),
      playlist: s.playlist.map((t) => (t.id === id ? { ...t, timesPlayed: (t.timesPlayed || 0) + 1 } : t)),
    })),
}))
