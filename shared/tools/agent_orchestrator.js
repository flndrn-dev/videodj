'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const https = require('https');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

// ---------------------------------------------------------------------------
// Auth headers
// ---------------------------------------------------------------------------

function buildAuthHeaders(apiKey) {
  if (!apiKey) return {};
  // OAuth tokens start with sk-ant-oat01-
  if (apiKey.startsWith('sk-ant-oat01-')) {
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
  }
  // Standard API key
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
}

// ---------------------------------------------------------------------------
// Tools registry
// ---------------------------------------------------------------------------

const TOOLS_DIR = path.resolve(__dirname, '../../desktop/tools');

const TOOLS = {
  scan_videos: {
    script: path.join(TOOLS_DIR, 'scan_videos.js'),
    description: 'Recursively scan a folder for video files',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Absolute path to scan' },
      },
      required: [],
    },
  },
  extract_metadata: {
    script: path.join(TOOLS_DIR, 'extract_metadata.js'),
    description: 'Extract metadata (title, artist, duration, BPM) from a video file',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the video file' },
      },
      required: ['filePath'],
    },
  },
  detect_dutch: {
    script: path.join(TOOLS_DIR, 'detect_dutch.js'),
    description: 'Detect whether a track is Dutch-language',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the video file' },
        metadata: { type: 'object', description: 'Optional pre-extracted metadata' },
      },
      required: ['filePath'],
    },
  },
  compute_bpm: {
    script: path.join(TOOLS_DIR, 'compute_bpm.js'),
    description: 'Compute BPM of a video/audio file',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the video file' },
      },
      required: ['filePath'],
    },
  },
  build_playlist: {
    script: path.join(TOOLS_DIR, 'build_playlist.js'),
    description: 'Build an ordered playlist from the library using BPM transitions and energy curve',
    parameters: {
      type: 'object',
      properties: {
        language_filter: { type: 'string', description: 'Filter by language, e.g. "nl" or null' },
        energy_curve: { type: 'string', enum: ['build', 'peak', 'natural'], description: 'Energy curve shape' },
        max_bpm_diff: { type: 'number', description: 'Maximum BPM difference between consecutive tracks' },
        count: { type: 'number', description: 'Number of tracks in the playlist' },
      },
      required: [],
    },
  },
  set_filter: {
    script: path.join(TOOLS_DIR, 'set_filter.js'),
    description: 'Set or clear the active language filter',
    parameters: {
      type: 'object',
      properties: {
        language: { type: ['string', 'null'], description: 'Language code to filter by, or null to clear' },
      },
      required: ['language'],
    },
  },
  play: {
    script: path.join(TOOLS_DIR, 'play.js'),
    description: 'Start playback of the current track',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  pause: {
    script: path.join(TOOLS_DIR, 'pause.js'),
    description: 'Pause playback',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  open_folder_picker: {
    script: path.join(TOOLS_DIR, 'open_folder_picker.js'),
    description: 'Open a native folder picker dialog so the user can choose their video library',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(context = {}) {
  const toolDefs = Object.entries(TOOLS).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return `You are videoDJ.Studio's AI assistant. You help DJs manage their video library and build playlists.

Your job is to understand what the user wants and call the appropriate tools.

Available tools:
${JSON.stringify(toolDefs, null, 2)}

Current context:
${JSON.stringify(context, null, 2)}

Rules:
- Respond ONLY with a JSON object: { "thought": "...", "tool_calls": [ { "name": "...", "input": { ... } } ] }
- You may call multiple tools in one response.
- If nothing is needed, return { "thought": "...", "tool_calls": [] }
- Do not include any text outside the JSON object.
- Always communicate in English.`;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

function callClaude(text, context, config) {
  return new Promise((resolve, reject) => {
    const env = loadEnv();
    const apiKey = config.apiKey || env.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;
    const model = config.model || env.AGENT_MODEL || 'claude-3-haiku-20240307';

    const headers = buildAuthHeaders(apiKey);

    const body = JSON.stringify({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(context),
      messages: [{ role: 'user', content: text }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401) {
          console.warn('[agent_orchestrator] WARNING: 401 Unauthorized — OAuth token may be invalid or expired. Falling back to mock response.');
          resolve({ mock: true });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            console.warn('[agent_orchestrator] API error:', parsed.error.message, '— falling back to mock.');
            resolve({ mock: true });
            return;
          }
          const content = parsed.content && parsed.content[0] && parsed.content[0].text;
          if (!content) {
            resolve({ mock: true });
            return;
          }
          resolve({ text: content });
        } catch (e) {
          resolve({ mock: true });
        }
      });
    });

    req.on('error', (e) => {
      console.warn('[agent_orchestrator] Network error:', e.message, '— falling back to mock.');
      resolve({ mock: true });
    });

    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Mock fallback
// ---------------------------------------------------------------------------

function mockAgentResponse(text) {
  const lower = text.toLowerCase();

  const toolCalls = [];

  if (/dutch|nl\b|nederlands|holland/.test(lower)) {
    toolCalls.push({ name: 'set_filter', input: { language: 'nl' } });
    toolCalls.push({ name: 'build_playlist', input: { language_filter: 'nl', energy_curve: 'build', count: 30 } });
    return {
      thought: 'User wants Dutch music. Setting language filter and building playlist.',
      tool_calls: toolCalls,
    };
  }

  if (/clear.*(filter|language)|remove.*(filter|language)|no filter|all (music|tracks|songs)/.test(lower)) {
    return {
      thought: 'User wants to clear the language filter.',
      tool_calls: [{ name: 'set_filter', input: { language: null } }],
    };
  }

  if (/mix|playlist|auto.?mix|build/.test(lower)) {
    return {
      thought: 'User wants to build a playlist.',
      tool_calls: [{ name: 'build_playlist', input: { energy_curve: 'build', count: 30 } }],
    };
  }

  if (/scan|library|folder|video/.test(lower)) {
    return {
      thought: 'User wants to scan their video library.',
      tool_calls: [{ name: 'open_folder_picker', input: {} }],
    };
  }

  if (/stop|pause/.test(lower)) {
    return {
      thought: 'User wants to pause playback.',
      tool_calls: [{ name: 'pause', input: {} }],
    };
  }

  if (/play|start/.test(lower)) {
    return {
      thought: 'User wants to start playback.',
      tool_calls: [{ name: 'play', input: {} }],
    };
  }

  return {
    thought: 'I did not understand the request. No tools called.',
    tool_calls: [],
  };
}

// ---------------------------------------------------------------------------
// Call agent (Claude + mock fallback)
// ---------------------------------------------------------------------------

async function callAgent(text, context, config = {}) {
  const result = await callClaude(text, context, config);

  if (result.mock) {
    return mockAgentResponse(text);
  }

  try {
    // Strip markdown code fences if present
    let raw = result.text.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[agent_orchestrator] Failed to parse Claude response as JSON, falling back to mock.');
    return mockAgentResponse(text);
  }
}

// ---------------------------------------------------------------------------
// Execute tool
// ---------------------------------------------------------------------------

function executeTool(toolCall) {
  return new Promise((resolve) => {
    const { name, input } = toolCall;
    const tool = TOOLS[name];

    if (!tool) {
      resolve({ tool: name, success: false, error: `Unknown tool: ${name}` });
      return;
    }

    if (!fs.existsSync(tool.script)) {
      resolve({ tool: name, success: false, error: `Tool script not found: ${tool.script}` });
      return;
    }

    const args = input && Object.keys(input).length > 0 ? [JSON.stringify(input)] : [];

    execFile('node', [tool.script, ...args], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ tool: name, success: false, error: err.message, stderr });
        return;
      }
      try {
        const output = JSON.parse(stdout.trim());
        resolve({ tool: name, success: true, output });
      } catch {
        resolve({ tool: name, success: true, output: stdout.trim() });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Main orchestrate function
// ---------------------------------------------------------------------------

async function orchestrate(text, context = {}, config = {}) {
  console.log(`[agent_orchestrator] Orchestrating: "${text}"`);

  const agentResponse = await callAgent(text, context, config);
  console.log('[agent_orchestrator] Agent thought:', agentResponse.thought);

  const toolCalls = agentResponse.tool_calls || [];
  const results = [];

  for (const toolCall of toolCalls) {
    console.log(`[agent_orchestrator] Executing tool: ${toolCall.name}`, toolCall.input);
    const result = await executeTool(toolCall);
    results.push(result);
    console.log(`[agent_orchestrator] Tool result: ${toolCall.name}`, result.success ? 'OK' : result.error);
  }

  return {
    success: true,
    thought: agentResponse.thought,
    toolCalls,
    results,
  };
}

// ---------------------------------------------------------------------------
// CLI support
// ---------------------------------------------------------------------------

if (require.main === module) {
  const text = process.argv[2];
  if (!text) {
    console.error('Usage: node agent_orchestrator.js "<prompt>"');
    process.exit(1);
  }

  orchestrate(text, {}, {})
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('Orchestration failed:', err);
      process.exit(1);
    });
}

module.exports = { loadEnv, buildAuthHeaders, TOOLS, buildSystemPrompt, callAgent, mockAgentResponse, executeTool, orchestrate };
