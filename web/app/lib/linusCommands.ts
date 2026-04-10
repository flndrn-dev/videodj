/**
 * Linus AI DJ Agent — Command Reference
 * All slash commands Linus understands.
 */

export interface CommandOption {
  label: string
  example: string
  description: string
}

export interface LinusCommand {
  command: string
  args?: string
  description: string
  category: 'library' | 'playlist' | 'mixing' | 'streaming' | 'recording' | 'discovery' | 'help'
  /** Sub-options shown in command reference */
  options?: CommandOption[]
}

export const LINUS_COMMANDS: LinusCommand[] = [
  // Library — single /fix with options
  { command: '/scan', description: 'Scan library and report missing metadata', category: 'library' },
  {
    command: '/fix',
    args: '[options]',
    description: 'Fix metadata — combine any options (Tab for options)',
    category: 'library',
    options: [
      { label: 'all', example: '/fix all', description: 'Full fix — album, genre, language, year + BPM, key' },
      { label: 'titles', example: '/fix titles', description: 'Fix missing or incorrect titles and artists' },
      { label: 'albums', example: '/fix albums', description: 'Look up and fill missing album names' },
      { label: 'genres', example: '/fix genres', description: 'Classify and fill missing genres' },
      { label: 'language', example: '/fix language', description: 'Detect and fill missing language codes' },
      { label: 'bpm', example: '/fix bpm', description: 'Re-analyze audio for missing BPM (runs locally)' },
      { label: 'keys', example: '/fix keys', description: 'Re-analyze audio for missing key (runs locally)' },
      { label: 'released', example: '/fix released', description: 'Look up and fill release years' },
    ],
  },
  { command: '/library-stats', description: 'Show library summary — track count, genres, languages, BPM range', category: 'library' },
  { command: '/duplicates', description: 'Find and list duplicate tracks', category: 'library' },
  { command: '/missing', description: 'List all tracks with incomplete metadata', category: 'library' },
  { command: '/health', description: 'Scan all video files for corruption — find broken, empty, or unplayable files', category: 'library' },
  {
    command: '/lookup',
    args: '[artist or song]',
    description: 'Search YouTube for music videos by artist or song name',
    category: 'library',
    options: [
      { label: 'artist', example: '/lookup Bon Jovi', description: 'Search all music videos by an artist' },
      { label: 'song', example: '/lookup Bon Jovi - Livin On A Prayer', description: 'Search a specific song' },
    ],
  },
  {
    command: '/suggest',
    description: 'Analyze your library and suggest 5 artists/songs to add — with YouTube links',
    category: 'library',
    options: [
      { label: 'genre', example: '/suggest rock', description: 'Suggest missing tracks in a specific genre' },
      { label: 'decade', example: '/suggest 80s', description: 'Suggest missing tracks from a decade' },
      { label: 'language', example: '/suggest NL', description: 'Suggest missing tracks in a language' },
    ],
  },

  // Playlist — single /playlist with options
  {
    command: '/playlist',
    args: '[options]',
    description: 'Build a smart playlist — combine any options (Tab for options)',
    category: 'playlist',
    options: [
      { label: 'genre', example: '/playlist rock', description: 'Filter by genre (rock, pop, house, etc.)' },
      { label: 'decade', example: '/playlist 80s', description: 'Filter by decade (70s, 80s, 90s, 00s)' },
      { label: 'bpm', example: '/playlist 120-140', description: 'Filter by BPM range' },
      { label: 'duration', example: '/playlist 2hr', description: 'Target playlist length (2hr, 90min)' },
      { label: 'language', example: '/playlist NL', description: 'Filter by language (EN, NL, DE, etc.)' },
      { label: 'energy', example: '/playlist build', description: 'Energy curve (build, peak, cooldown)' },
    ],
  },

  // Mixing
  { command: '/next', description: 'Suggest best next tracks + load into deck', category: 'mixing' },
  { command: '/key-match', description: 'Show harmonically compatible tracks (Camelot wheel)', category: 'mixing' },
  { command: '/bpm-match', description: 'Show tracks within BPM range of current track', category: 'mixing' },
  { command: '/autoplay', description: 'Start autoplay — smart BPM-matched deck switching', category: 'mixing' },
  {
    command: '/automix',
    args: '[options]',
    description: 'Start automix — Linus DJs with beatmatching + segment mixing (Tab for options)',
    category: 'mixing',
    options: [
      { label: 'artist', example: '/automix Enrique Iglesias', description: 'Automix tracks by a specific artist' },
      { label: 'genre', example: '/automix rock', description: 'Automix filtered by genre' },
      { label: 'decade', example: '/automix 80s', description: 'Automix from a specific decade' },
      { label: 'duration', example: '/automix 1hr', description: 'Target automix duration' },
      { label: 'bpm', example: '/automix 120-140', description: 'Automix within BPM range' },
      { label: 'energy', example: '/automix build', description: 'Energy curve (build, peak, cooldown)' },
    ],
  },
  { command: '/stop', description: 'Stop autoplay or automix', category: 'mixing' },

  // Streaming
  {
    command: '/stream',
    args: '[options]',
    description: 'Build a streaming set — combine any options (Tab for options)',
    category: 'streaming',
    options: [
      { label: 'genre', example: '/stream rock', description: 'Filter by genre (rock, pop, house, etc.)' },
      { label: 'decade', example: '/stream 80s', description: 'Filter by decade (70s, 80s, 90s, 00s)' },
      { label: 'bpm', example: '/stream 120-140', description: 'Filter by BPM range' },
      { label: 'duration', example: '/stream 3hr', description: 'Target stream length (3hr, 90min)' },
      { label: 'language', example: '/stream NL', description: 'Filter by language (EN, NL, DE, etc.)' },
      { label: 'energy', example: '/stream build', description: 'Energy curve (build, peak, cooldown)' },
    ],
  },

  // Recording
  { command: '/record', description: 'Start recording the DJ mix (audio + video)', category: 'recording' },
  { command: '/stop-recording', description: 'Stop recording and save the mix', category: 'recording' },
  { command: '/history', description: 'View past DJ sets with tracklists and timestamps', category: 'recording' },

  // Discovery
  { command: '/recommend', description: 'Suggest 5 tracks from your library you haven\'t played much', category: 'discovery' },
  { command: '/catalog', args: '<search>', description: 'Search the shared catalog — find tracks other DJs have', category: 'discovery' },

  // Help
  { command: '/help', description: 'Open this command reference', category: 'help' },
  { command: '/about', description: 'About Linus AI DJ Agent', category: 'help' },
]

export const CATEGORY_LABELS: Record<string, string> = {
  library: 'Library',
  playlist: 'Playlist',
  mixing: 'Mixing',
  streaming: 'Streaming',
  recording: 'Recording',
  discovery: 'Discovery',
  help: 'Help',
}

/** Filter commands by prefix for autocomplete */
export function filterCommands(input: string): LinusCommand[] {
  if (!input.startsWith('/')) return []
  const q = input.toLowerCase()
  return LINUS_COMMANDS.filter(c => c.command.startsWith(q))
}

/** Check if input should show option hints */
export function getOptionHint(input: string): { command: string; options: CommandOption[] } | null {
  const trimmed = input.trim().toLowerCase()
  for (const cmd of LINUS_COMMANDS) {
    if (cmd.options && (trimmed === cmd.command || trimmed.startsWith(cmd.command + ' '))) {
      return { command: cmd.command, options: cmd.options }
    }
  }
  return null
}
