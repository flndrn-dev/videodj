'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ---------------------------------------------------------------------------
// Dutch language codes (ISO 639)
// ---------------------------------------------------------------------------

const NL_CODES = new Set(['nl', 'nld', 'dut', 'nl-nl', 'nl-be', 'nl_nl', 'nl_be']);

// ---------------------------------------------------------------------------
// Dutch title keyword matching
// ---------------------------------------------------------------------------

const NL_WORDS = [
  'de', 'het', 'een', 'van', 'voor', 'met', 'dat', 'dit', 'mijn', 'jij',
  'jou', 'ons', 'wij', 'zij', 'haar', 'zijn', 'niet', 'maar', 'want',
  'omdat', 'als', 'door', 'op', 'aan', 'bij', 'nog', 'zo', 'al', 'wel',
  'meer', 'dan', 'nu', 'al', 'heel', 'steeds', 'nooit', 'altijd', 'alles',
  'liefde', 'hart', 'leven', 'wereld', 'nacht', 'dag', 'tijd', 'thuis',
];

// ---------------------------------------------------------------------------
// Dutch artists list (loaded from shared context)
// ---------------------------------------------------------------------------

let dutchArtists = null;

function loadDutchArtists() {
  if (dutchArtists !== null) return dutchArtists;

  const mdPath = path.resolve(__dirname, '../../shared/context/dutch_artists.md');
  if (!fs.existsSync(mdPath)) {
    dutchArtists = [];
    return dutchArtists;
  }

  const content = fs.readFileSync(mdPath, 'utf8');
  const artists = [];

  for (const line of content.split('\n')) {
    const trimmed = line.replace(/^[-*#\s]+/, '').trim();
    if (trimmed && !trimmed.startsWith('<!--') && trimmed.length > 1) {
      artists.push(trimmed.toLowerCase());
    }
  }

  dutchArtists = artists;
  return dutchArtists;
}

// ---------------------------------------------------------------------------
// Tier 1: metadata language tag
// ---------------------------------------------------------------------------

function checkLanguageTag(metadata) {
  if (!metadata || !metadata.language) return null;
  const lang = metadata.language.toLowerCase().trim();
  if (NL_CODES.has(lang)) return true;
  return null; // inconclusive
}

// ---------------------------------------------------------------------------
// Tier 2: known Dutch artist list + title word matching
// ---------------------------------------------------------------------------

function checkArtistAndTitle(metadata) {
  const artists = loadDutchArtists();

  if (metadata && metadata.artist) {
    const artistLower = metadata.artist.toLowerCase();
    for (const known of artists) {
      if (artistLower.includes(known) || known.includes(artistLower)) {
        return true;
      }
    }
  }

  if (metadata && metadata.title) {
    const words = metadata.title.toLowerCase().split(/\s+/);
    let matchCount = 0;
    for (const word of words) {
      if (NL_WORDS.includes(word)) matchCount++;
    }
    if (matchCount >= 2) return true;
  }

  return null; // inconclusive
}

// ---------------------------------------------------------------------------
// Tier 3: Whisper CLI (speech-to-text language detection)
// ---------------------------------------------------------------------------

function checkWhisper(filePath) {
  return new Promise((resolve) => {
    // Attempt to use whisper CLI — may not be installed
    execFile(
      'whisper',
      [filePath, '--task', 'detect-language', '--output_format', 'json', '--output_dir', '/tmp'],
      { timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) {
          // Whisper not available or failed
          resolve(null);
          return;
        }

        // Try to parse whisper output
        const combined = stdout + stderr;
        const langMatch = combined.match(/detected language[:\s]+([a-z]{2,3})/i);
        if (langMatch) {
          const lang = langMatch[1].toLowerCase();
          resolve(NL_CODES.has(lang) ? true : false);
          return;
        }

        // Try JSON output file
        const base = path.basename(filePath, path.extname(filePath));
        const jsonOut = path.join('/tmp', `${base}.json`);
        if (fs.existsSync(jsonOut)) {
          try {
            const data = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
            if (data.language) {
              resolve(NL_CODES.has(data.language.toLowerCase()));
              return;
            }
          } catch {
            // ignore
          }
        }

        resolve(null);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Main detect function
// ---------------------------------------------------------------------------

async function detectDutch(filePath, metadata = null) {
  // Tier 1: metadata language tag
  const tagResult = checkLanguageTag(metadata);
  if (tagResult !== null) {
    return { isDutch: tagResult, method: 'language_tag', confidence: 'high' };
  }

  // Tier 2: artist list + title matching
  const artistResult = checkArtistAndTitle(metadata);
  if (artistResult !== null) {
    return { isDutch: artistResult, method: 'artist_list', confidence: 'medium' };
  }

  // Tier 3: Whisper
  const whisperResult = await checkWhisper(filePath);
  if (whisperResult !== null) {
    return { isDutch: whisperResult, method: 'whisper', confidence: 'high' };
  }

  // Unknown
  return { isDutch: false, method: 'unknown', confidence: 'low' };
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
    console.error('Usage: node detect_dutch.js <filePath>');
    process.exit(1);
  }

  detectDutch(filePath, input.metadata || null)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { detectDutch, checkLanguageTag, checkArtistAndTitle, NL_CODES, NL_WORDS };
