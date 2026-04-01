'use strict';

const path = require('path');
const { execFile } = require('child_process');

/**
 * Try to load music-metadata (optional peer dependency).
 * Falls back gracefully if not installed.
 */
let musicMetadata = null;
try {
  musicMetadata = require('music-metadata');
} catch {
  // Not installed — will use ffprobe + filename fallback
}

// ---------------------------------------------------------------------------
// Filename parser: "Artist - Title" pattern
// ---------------------------------------------------------------------------

function parseFilename(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const dashIdx = base.indexOf(' - ');
  if (dashIdx !== -1) {
    return {
      artist: base.slice(0, dashIdx).trim(),
      title: base.slice(dashIdx + 3).trim(),
    };
  }
  return { artist: null, title: base.trim() };
}

// ---------------------------------------------------------------------------
// ffprobe extraction
// ---------------------------------------------------------------------------

function ffprobeMetadata(filePath) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const fmt = data.format || {};
          const tags = fmt.tags || {};
          const audioStream = (data.streams || []).find((s) => s.codec_type === 'audio');

          resolve({
            title: tags.title || tags.Title || null,
            artist: tags.artist || tags.Artist || tags.ARTIST || null,
            album: tags.album || tags.Album || null,
            language: tags.language || tags.Language || (audioStream && audioStream.tags && audioStream.tags.language) || null,
            duration: fmt.duration ? parseFloat(fmt.duration) : null,
            bitrate: fmt.bit_rate ? parseInt(fmt.bit_rate, 10) : null,
          });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// music-metadata extraction
// ---------------------------------------------------------------------------

async function musicMetaExtract(filePath) {
  if (!musicMetadata) return null;
  try {
    const meta = await musicMetadata.parseFile(filePath, { duration: true });
    const common = meta.common || {};
    return {
      title: common.title || null,
      artist: common.artist || null,
      album: common.album || null,
      language: common.language || null,
      duration: meta.format && meta.format.duration ? meta.format.duration : null,
      bitrate: meta.format && meta.format.bitrate ? meta.format.bitrate : null,
      bpm: common.bpm ? parseFloat(common.bpm) : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main extract function
// ---------------------------------------------------------------------------

async function extractMetadata(filePath) {
  const fileName = path.basename(filePath);
  const filenameParsed = parseFilename(fileName);

  // Try music-metadata first (supports many formats)
  let meta = await musicMetaExtract(filePath);

  // Fall back to ffprobe
  if (!meta || (!meta.title && !meta.artist)) {
    const probeMeta = await ffprobeMetadata(filePath);
    if (probeMeta) {
      meta = { ...probeMeta, bpm: null };
    }
  }

  if (!meta) {
    meta = { title: null, artist: null, album: null, language: null, duration: null, bitrate: null, bpm: null };
  }

  // Apply filename fallback for missing title/artist
  if (!meta.title) meta.title = filenameParsed.title;
  if (!meta.artist) meta.artist = filenameParsed.artist;

  return {
    filePath,
    fileName,
    title: meta.title,
    artist: meta.artist,
    album: meta.album || null,
    language: meta.language || null,
    duration: meta.duration || null,
    bitrate: meta.bitrate || null,
    bpm: meta.bpm || null,
    source: meta.title !== filenameParsed.title ? 'metadata' : 'filename',
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
      input = { filePath: process.argv[2] };
    }
  }

  const filePath = input.filePath;
  if (!filePath) {
    console.error('Usage: node extract_metadata.js <filePath>');
    process.exit(1);
  }

  extractMetadata(filePath)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { extractMetadata, parseFilename, ffprobeMetadata };
