'use strict';

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.resolve(__dirname, '../../desktop/state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function pause() {
  const state = loadState();
  state.playback = 'paused';
  state.playback_paused_at = new Date().toISOString();
  saveState(state);

  return {
    success: true,
    playback: 'paused',
    message: 'Playback paused',
  };
}

if (require.main === module) {
  const result = pause();
  console.log(JSON.stringify(result));
}

module.exports = { pause };
