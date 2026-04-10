'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// SQLite (better-sqlite3) — optional dependency
// ---------------------------------------------------------------------------

let Database = null;
try {
  Database = require('better-sqlite3');
} catch {
  // Not installed — will use in-memory mock data
}

const DB_PATH = path.resolve(__dirname, '../../desktop/library.db');

// ---------------------------------------------------------------------------
// Energy curve ordering
// ---------------------------------------------------------------------------

// build:   low → high BPM (ramp up energy)
// peak:    start mid, peak at 60%, then taper
// natural: no sorting, respect library order

function applyCurve(tracks, curve) {
  if (!tracks || tracks.length === 0) return tracks;

  switch (curve) {
    case 'build':
      return [...tracks].sort((a, b) => (a.bpm || 0) - (b.bpm || 0));

    case 'peak': {
      const sorted = [...tracks].sort((a, b) => (a.bpm || 0) - (b.bpm || 0));
      const half = Math.floor(sorted.length / 2);
      // Ascend to half, then reverse the rest to descend
      const ascending = sorted.slice(0, half);
      const descending = sorted.slice(half).reverse();
      return [...ascending, ...descending];
    }

    case 'natural':
    default:
      return tracks;
  }
}

// ---------------------------------------------------------------------------
// BPM transition filter
// ---------------------------------------------------------------------------

function bpmTransitionSort(tracks, maxBpmDiff) {
  if (!tracks || tracks.length === 0) return tracks;

  const result = [tracks[0]];
  const remaining = tracks.slice(1);

  while (remaining.length > 0) {
    const last = result[result.length - 1];
    const lastBpm = last.bpm || 0;

    // Find best next track within BPM range
    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const diff = Math.abs((remaining[i].bpm || 0) - lastBpm);
      if (diff <= maxBpmDiff && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // No track within range — just take the next one
      bestIdx = 0;
    }

    result.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Artist repeat window (avoid same artist back-to-back)
// ---------------------------------------------------------------------------

const ARTIST_WINDOW = 3;

function enforceArtistWindow(tracks) {
  if (!tracks || tracks.length === 0) return tracks;

  const result = [];
  const deferred = [];

  for (const track of tracks) {
    const recentArtists = result.slice(-ARTIST_WINDOW).map((t) => (t.artist || '').toLowerCase());
    const artist = (track.artist || '').toLowerCase();

    if (artist && recentArtists.includes(artist)) {
      deferred.push(track);
    } else {
      result.push(track);
      // Try to insert deferred tracks now
      for (let i = deferred.length - 1; i >= 0; i--) {
        const dArtist = (deferred[i].artist || '').toLowerCase();
        const recent = result.slice(-ARTIST_WINDOW).map((t) => (t.artist || '').toLowerCase());
        if (!dArtist || !recent.includes(dArtist)) {
          result.push(deferred.splice(i, 1)[0]);
        }
      }
    }
  }

  // Append any remaining deferred tracks at the end
  return [...result, ...deferred];
}

// ---------------------------------------------------------------------------
// SQLite query
// ---------------------------------------------------------------------------

function queryLibrary(options = {}) {
  const { language_filter, count } = options;

  if (!Database) {
    // Return mock data when SQLite is not available
    return getMockTracks(language_filter, count);
  }

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch {
    return getMockTracks(language_filter, count);
  }

  try {
    let sql = 'SELECT * FROM tracks WHERE 1=1';
    const params = [];

    if (language_filter) {
      sql += ' AND language = ?';
      params.push(language_filter);
    }

    sql += ' ORDER BY RANDOM()';

    if (count) {
      sql += ' LIMIT ?';
      params.push(count);
    }

    const rows = db.prepare(sql).all(...params);
    return rows;
  } catch (e) {
    console.warn('[build_playlist] SQLite query failed:', e.message);
    return getMockTracks(language_filter, count);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Mock tracks for demo mode
// ---------------------------------------------------------------------------

function getMockTracks(languageFilter, count = 30) {
  const mockLibrary = [
    { id: 1, title: 'Dansen aan Zee', artist: 'Marco Borsato', bpm: 120, language: 'nl', duration: 210 },
    { id: 2, title: 'Vrienden', artist: 'Nick & Simon', bpm: 115, language: 'nl', duration: 198 },
    { id: 3, title: 'Als Ze Er Niet Is', artist: 'André Hazes', bpm: 100, language: 'nl', duration: 225 },
    { id: 4, title: 'Grote Dag', artist: 'Guus Meeuwis', bpm: 110, language: 'nl', duration: 240 },
    { id: 5, title: 'Zoutelande', artist: 'Bløf', bpm: 95, language: 'nl', duration: 256 },
    { id: 6, title: 'Oya Lele', artist: 'K3', bpm: 130, language: 'nl', duration: 180 },
    { id: 7, title: 'Blinding Lights', artist: 'The Weeknd', bpm: 171, language: 'en', duration: 200 },
    { id: 8, title: 'Shape of You', artist: 'Ed Sheeran', bpm: 96, language: 'en', duration: 234 },
    { id: 9, title: 'Stay', artist: 'Justin Bieber', bpm: 170, language: 'en', duration: 141 },
    { id: 10, title: 'Levitating', artist: 'Dua Lipa', bpm: 103, language: 'en', duration: 203 },
    { id: 11, title: 'Paparazzi', artist: 'Snelle', bpm: 108, language: 'nl', duration: 195 },
    { id: 12, title: 'Le Monde Est Stone', artist: 'Stromae', bpm: 125, language: 'fr', duration: 218 },
    { id: 13, title: 'Formidable', artist: 'Stromae', bpm: 140, language: 'fr', duration: 197 },
    { id: 14, title: 'Clouseau Mix', artist: 'Clouseau', bpm: 118, language: 'nl', duration: 230 },
    { id: 15, title: 'Summer Nights', artist: 'DJ Mix', bpm: 128, language: 'en', duration: 188 },
  ];

  let filtered = languageFilter
    ? mockLibrary.filter((t) => t.language === languageFilter)
    : mockLibrary;

  return filtered.slice(0, count);
}

// ---------------------------------------------------------------------------
// Main build function
// ---------------------------------------------------------------------------

function buildPlaylist(options = {}) {
  const {
    language_filter = null,
    energy_curve = 'build',
    max_bpm_diff = 10,
    count = 30,
  } = options;

  // 1. Query library
  let tracks = queryLibrary({ language_filter, count: count * 2 }); // fetch extra for filtering

  // 2. Apply energy curve ordering
  tracks = applyCurve(tracks, energy_curve);

  // 3. BPM transition sorting
  tracks = bpmTransitionSort(tracks, max_bpm_diff);

  // 4. Artist repeat window
  tracks = enforceArtistWindow(tracks);

  // 5. Trim to requested count
  tracks = tracks.slice(0, count);

  return {
    playlist: tracks,
    count: tracks.length,
    language_filter,
    energy_curve,
  };
}

// ---------------------------------------------------------------------------
// CLI support
// ---------------------------------------------------------------------------

if (require.main === module) {
  let input = {};
  if (process.argv[2]) {
    try {
      input = JSON.parse(process.argv[2]);
    } catch {
      console.error('Usage: node build_playlist.js \'{"language_filter":"nl","energy_curve":"build","count":30}\'');
      process.exit(1);
    }
  }

  const result = buildPlaylist(input);
  console.log(JSON.stringify(result));
}

module.exports = { buildPlaylist, applyCurve, bpmTransitionSort, enforceArtistWindow };
