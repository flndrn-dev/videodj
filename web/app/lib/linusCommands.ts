/**
 * Linus AI DJ Agent — Command Reference
 * All slash commands Linus understands.
 */

export interface LinusCommand {
  command: string
  args?: string
  description: string
  category: 'library' | 'playlist' | 'mixing' | 'streaming' | 'help'
}

export const LINUS_COMMANDS: LinusCommand[] = [
  // Library
  { command: '/scan', description: 'Scan library and report missing metadata', category: 'library' },
  { command: '/fix-all', description: 'Full metadata fix — AI lookup (album, genre, year) + audio analysis (BPM, key)', category: 'library' },
  { command: '/fix-titles', description: 'Fix missing or incorrect titles and artists', category: 'library' },
  { command: '/fix-albums', description: 'Look up and fill missing album names', category: 'library' },
  { command: '/fix-genres', description: 'Classify and fill missing genres', category: 'library' },
  { command: '/fix-language', description: 'Detect and fill missing language codes', category: 'library' },
  { command: '/fix-bpm', description: 'Re-analyze audio for tracks with missing BPM (runs locally)', category: 'library' },
  { command: '/fix-keys', description: 'Re-analyze audio for tracks with missing key (runs locally)', category: 'library' },
  { command: '/fix-released', description: 'Look up and fill release years', category: 'library' },
  { command: '/library-stats', description: 'Show library summary — track count, genres, languages, BPM range', category: 'library' },
  { command: '/duplicates', description: 'Find and list duplicate tracks in the library', category: 'library' },
  { command: '/missing', description: 'List all tracks with incomplete metadata', category: 'library' },

  // Playlist
  { command: '/playlist', description: 'Build a smart playlist from the full library', category: 'playlist' },
  { command: '/playlist-genre', args: '[genre]', description: 'Build playlist filtered by genre (e.g. /playlist-genre House)', category: 'playlist' },
  { command: '/playlist-lang', args: '[lang]', description: 'Build playlist filtered by language (e.g. /playlist-lang NL)', category: 'playlist' },
  { command: '/playlist-decade', args: '[decade]', description: 'Build playlist from a decade (e.g. /playlist-decade 80s)', category: 'playlist' },
  { command: '/playlist-bpm', args: '[min]-[max]', description: 'Build playlist within BPM range (e.g. /playlist-bpm 120-135)', category: 'playlist' },
  { command: '/playlist-duration', args: '[hours]', description: 'Build playlist to fill a time slot (e.g. /playlist-duration 2)', category: 'playlist' },
  { command: '/playlist-energy', args: '[curve]', description: 'Build with energy curve: build, peak, or cooldown', category: 'playlist' },
  { command: '/set', args: '[description]', description: 'Build a themed set (e.g. /set 70s number 1 hits)', category: 'playlist' },

  // Mixing
  { command: '/next', description: 'Suggest the best next track based on current playing track', category: 'mixing' },
  { command: '/key-match', description: 'Show tracks harmonically compatible with current (Camelot wheel)', category: 'mixing' },
  { command: '/bpm-match', description: 'Show tracks within BPM range of current playing track', category: 'mixing' },
  { command: '/autoplay', description: 'Start autoplay mode — random BPM-matched deck switching', category: 'mixing' },
  { command: '/automix', description: 'Start automix — Linus DJs with smart selection, beatmatching, energy curves', category: 'mixing' },
  { command: '/stop', description: 'Stop autoplay or automix', category: 'mixing' },

  // Streaming
  { command: '/stream', args: '[duration]', description: 'Build a set for live streaming (e.g. /stream 4h)', category: 'streaming' },
  { command: '/stream-theme', args: '[theme]', description: 'Build themed stream set (e.g. /stream-theme 90s dance party)', category: 'streaming' },

  // Help
  { command: '/help', description: 'Open this command reference', category: 'help' },
  { command: '/about', description: 'About Linus AI DJ Agent', category: 'help' },
]

export const CATEGORY_LABELS: Record<string, string> = {
  library: 'Library',
  playlist: 'Playlist',
  mixing: 'Mixing',
  streaming: 'Streaming',
  help: 'Help',
}

/** Filter commands by prefix for autocomplete */
export function filterCommands(input: string): LinusCommand[] {
  if (!input.startsWith('/')) return []
  const q = input.toLowerCase()
  return LINUS_COMMANDS.filter(c => c.command.startsWith(q))
}
