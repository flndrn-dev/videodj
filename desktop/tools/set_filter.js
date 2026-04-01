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

function setFilter(options = {}) {
  const { language } = options;
  const state = loadState();
  const previous = state.language_filter || null;
  state.language_filter = language || null;
  saveState(state);

  return {
    success: true,
    language_filter: state.language_filter,
    previous,
    message: language
      ? `Language filter set to: ${language}`
      : 'Language filter cleared',
  };
}

if (require.main === module) {
  let input = {};
  if (process.argv[2]) {
    try {
      input = JSON.parse(process.argv[2]);
    } catch {
      input = { language: process.argv[2] === 'null' ? null : process.argv[2] };
    }
  }

  const result = setFilter(input);
  console.log(JSON.stringify(result));
}

module.exports = { setFilter };
