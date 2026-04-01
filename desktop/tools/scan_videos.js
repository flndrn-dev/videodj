'use strict';

const fs = require('fs');
const path = require('path');

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm',
  '.m4v', '.flv', '.wmv', '.ts', '.mpeg', '.mpg',
]);

/**
 * Recursively scan a directory for video files.
 * @param {string} dir - Directory to scan
 * @returns {Array<{filePath, fileName, fileSize, extension, mtime}>}
 */
function scanVideos(dir) {
  const results = [];

  if (!dir || !fs.existsSync(dir)) {
    return results;
  }

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // Permission denied or other error — skip
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories
        if (!entry.name.startsWith('.')) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          let stat;
          try {
            stat = fs.statSync(fullPath);
          } catch {
            continue;
          }
          results.push({
            filePath: fullPath,
            fileName: entry.name,
            fileSize: stat.size,
            extension: ext,
            mtime: stat.mtime.toISOString(),
          });
        }
      }
    }
  }

  walk(dir);
  return results;
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
      input = { folder: process.argv[2] };
    }
  }

  const folder = input.folder || process.env.HOME || '/tmp';
  const results = scanVideos(folder);
  console.log(JSON.stringify(results));
}

module.exports = { scanVideos, VIDEO_EXTENSIONS };
