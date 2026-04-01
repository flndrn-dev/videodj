'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// ---------------------------------------------------------------------------
// Helper: run a command and return stdout
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60000, ...opts }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Tier 1: aubio
// ---------------------------------------------------------------------------

async function aubioDetect(filePath) {
  try {
    const stdout = await run('aubiotempo', ['-i', filePath]);
    const lines = stdout.split('\n').filter(Boolean);
    const bpmLine = lines.find((l) => /^\d+(\.\d+)?$/.test(l.trim()));
    if (bpmLine) {
      const bpm = parseFloat(bpmLine.trim());
      if (bpm > 40 && bpm < 300) {
        return { bpm, confidence: 'high', method: 'aubio' };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tier 2: ffmpeg WAV extraction + energy peak analysis
// ---------------------------------------------------------------------------

async function ffmpegWavExtract(filePath) {
  const tmpWav = path.join(os.tmpdir(), `djstudio_bpm_${Date.now()}.wav`);

  try {
    await run('ffmpeg', [
      '-i', filePath,
      '-ac', '1',             // mono
      '-ar', '22050',         // 22 kHz sample rate
      '-t', '60',             // first 60 seconds
      '-vn',                  // no video
      '-y',
      tmpWav,
    ]);

    // Parse the WAV file header + raw PCM for energy analysis
    const buf = fs.readFileSync(tmpWav);
    const sampleRate = buf.readUInt32LE(24); // from WAV header
    const bpm = energyPeakBpm(buf.slice(44), sampleRate);

    return bpm ? { bpm, confidence: 'medium', method: 'ffmpeg_wav' } : null;
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpWav); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Energy peak analysis (simple onset detection)
// ---------------------------------------------------------------------------

function energyPeakBpm(pcmBuf, sampleRate) {
  // 16-bit PCM assumed
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
  const energies = [];

  for (let i = 0; i + windowSize * 2 < pcmBuf.length; i += windowSize * 2) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      const sample = pcmBuf.readInt16LE(i + j * 2) / 32768;
      energy += sample * sample;
    }
    energies.push(energy / windowSize);
  }

  if (energies.length < 10) return null;

  // Detect peaks (onset frames)
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const threshold = mean * 1.5;

  const peaks = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (
      energies[i] > threshold &&
      energies[i] > energies[i - 1] &&
      energies[i] > energies[i + 1]
    ) {
      peaks.push(i);
    }
  }

  if (peaks.length < 4) return null;

  // Calculate average interval between peaks
  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  const windowDuration = 0.01; // 10ms per window
  const secondsPerBeat = medianInterval * windowDuration;
  const bpm = Math.round(60 / secondsPerBeat);

  // Sanity check
  if (bpm < 40 || bpm > 300) return null;

  return bpm;
}

// ---------------------------------------------------------------------------
// Main compute function
// ---------------------------------------------------------------------------

async function computeBpm(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Tier 1: aubio
  const aubioResult = await aubioDetect(filePath);
  if (aubioResult) return aubioResult;

  // Tier 2: ffmpeg WAV + energy peaks
  const ffmpegResult = await ffmpegWavExtract(filePath);
  if (ffmpegResult) return ffmpegResult;

  // All methods failed — return null BPM
  return { bpm: null, confidence: 'none', method: 'failed' };
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
    console.error('Usage: node compute_bpm.js <filePath>');
    process.exit(1);
  }

  computeBpm(filePath)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { computeBpm, energyPeakBpm, aubioDetect };
