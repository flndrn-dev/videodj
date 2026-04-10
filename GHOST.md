# Ghost — Background Self-Healing Agent

Ghost is a fully autonomous background agent for videoDJ.Studio. It silently monitors the web and desktop applications, catches errors and performance issues, auto-fixes them, and learns from every encounter. Ghost is completely independent from Linus — Linus is the DJ brain, Ghost is the immune system.

---

## Architecture: Hybrid (Client + Server)

```
┌─────────────────────────────────────────────────────────┐
│                    KVM2 VPS (Ollama)                     │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  Ollama Server (:11434)                     │        │
│  │  └── Qwen 2.5 Coder 32B                    │        │
│  │      ├── Ghost analysis requests            │        │
│  │      └── Linus chat requests                │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
           ▲                        ▲
           │ HTTPS                  │ HTTPS
           │                        │
┌──────────┴────────────────────────┴─────────────────────┐
│                  KVM4 VPS (Dokploy)                      │
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  Ghost Server        │  │  Admin Dashboard          │ │
│  │  ghost.videodj.studio│  │  admin.videodj.studio     │ │
│  │                      │  │                           │ │
│  │  • Telemetry ingest  │  │  • Ghost heartbeat/logs   │ │
│  │  • LLM orchestration │  │  • Linus stats/history    │ │
│  │  • Knowledge base DB │  │  • System health (VPS)    │ │
│  │  • Fix command queue  │  │  • Ollama GPU/RAM/models  │ │
│  │  • Learning loop     │◄─┤  • App analytics          │ │
│  └──────────┬───────────┘  └──────────────────────────┘ │
└─────────────┼───────────────────────────────────────────┘
              │ WebSocket + REST
              ▼
┌─────────────────────────────────────────────────────────┐
│            User's Browser / Electron App                 │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │  videoDJ.Studio (app.videodj.studio)                ││
│  │  ┌───────────────────────────────────┐              ││
│  │  │  Ghost Client Module              │              ││
│  │  │  • Error interceptor              │              ││
│  │  │  • Performance monitor            │              ││
│  │  │  • Rules-based auto-fixer         │              ││
│  │  │  • Telemetry shipper              │              ││
│  │  │  • Fix command receiver           │              ││
│  │  └───────────────────────────────────┘              ││
│  │                                                     ││
│  │  ┌─────────┐  ┌──────────────────┐                  ││
│  │  │ Linus   │  │  DJ App (decks,  │                  ││
│  │  │ Agent   │  │  playlist, etc.) │                  ││
│  │  └─────────┘  └──────────────────┘                  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Domain Map

| Subdomain                | What                       | Where                                                   |
| ------------------------ | -------------------------- | ------------------------------------------------------- |
| **app.videodj.studio**   | DJ app (Next.js)           | KVM4 via Dokploy                                        |
| **admin.videodj.studio** | Admin Dashboard            | KVM4 via Dokploy                                        |
| **ghost.videodj.studio** | Ghost Server API           | KVM4 via Dokploy                                        |
| KVM4 (localhost)         | Ollama + Qwen 2.5-Coder 7B | Internal only, migrating to dedicated server next month |

---

## Ghost Client Module (Inside the DJ App)

Lightweight JavaScript module running inside the browser/Electron. Hooks into the runtime silently.

### What Ghost Client Monitors

| Category              | What it catches                                                      | Example                                     |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| **Runtime errors**    | Unhandled exceptions, promise rejections, React error boundaries     | `Cannot read property 'bpm' of undefined`   |
| **Audio health**      | AudioContext state, buffer underruns, decode failures, silent output | Audio context suspended after tab switch    |
| **Video health**      | Playback stalls, decode errors, black frames, failed loads           | Video element stuck in `waiting` state      |
| **State consistency** | Zustand store anomalies, orphaned deck references, stale track data  | Deck A says playing but audio isn't running |
| **Performance**       | Memory leaks, frame drops below 30fps, IndexedDB quota pressure      | App using 2GB+ RAM after 50 track uploads   |
| **Network**           | WebSocket drops, RTMP stream failures, API timeouts                  | Stream to Twitch disconnects mid-broadcast  |
| **IndexedDB**         | Failed reads/writes, orphaned blobs, corruption                      | Track blob saved but metadata write failed  |

### Rules-Based Auto-Fixes (No LLM, Instant)

| Problem                                           | Fix                                          |
| ------------------------------------------------- | -------------------------------------------- |
| AudioContext suspended                            | `.resume()`                                  |
| Video stalled                                     | Seek back 0.1s + `.play()`                   |
| WebSocket dropped                                 | Reconnect with exponential backoff           |
| RTMP stream lost                                  | Re-initialize stream pipeline                |
| IndexedDB write failed                            | Retry with backoff (3 attempts)              |
| Memory pressure                                   | Clear cached waveform data, trigger GC hints |
| State mismatch (deck says playing, audio stopped) | Sync state to reality                        |

### Telemetry Packet Format

Everything the client can't fix with rules gets shipped to Ghost Server:

```json
{
  "type": "error | performance | state | recovery",
  "severity": "low | medium | high | critical",
  "timestamp": "ISO string",
  "context": {
    "component": "DeckA | Playlist | Automix | etc",
    "userAction": "what the user was doing",
    "appState": "compressed relevant state snapshot"
  },
  "error": { "message": "", "stack": "", "count": 0 },
  "fixAttempted": { "rule": "", "result": "success | failed" },
  "sessionId": "string"
}
```

**Key principle:** Ghost Client is fast and dumb. It applies known fixes instantly, ships everything else upstream. It never calls the LLM directly.

---

## Ghost Server (ghost.videodj.studio)

The brain on KVM4. Receives telemetry, orchestrates LLM analysis, maintains the knowledge base, sends fix commands back.

### Telemetry Ingest API

- REST endpoint for telemetry packets from Ghost Client
- WebSocket connection for real-time bi-directional communication (fix commands back to client)
- Rate limiting — batches and deduplicates before processing
- Auth via API key per app instance (SaaS-ready)

### Knowledge Base (PostgreSQL on KVM4)

The learning memory:

| Column          | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `error_pattern` | Normalized error signature (stack trace fingerprint)                    |
| `context_hash`  | What component/action triggered it                                      |
| `fix_action`    | What fix was applied                                                    |
| `success_rate`  | % of times this fix worked                                              |
| `times_seen`    | How often this pattern occurs                                           |
| `first_seen`    | When Ghost first encountered it                                         |
| `last_seen`     | Most recent occurrence                                                  |
| `llm_analysis`  | Qwen's diagnosis (cached)                                               |
| `auto_promote`  | If success_rate > 90% after 5+ occurrences, promote to client-side rule |

### Learning Loop

```
New error arrives
    │
    ▼
Search knowledge base for matching pattern
    │
    ├── Match found, success_rate > 90%
    │   └── Apply known fix immediately → send fix command to client
    │
    ├── Match found, success_rate < 90%
    │   └── Send to Qwen for re-analysis → try new fix → update KB
    │
    └── No match (new error)
        └── Send to Qwen with full context → receive diagnosis + suggested fix
            → send fix command to client → log result → create KB entry
```

**Rule promotion:** When a fix hits 90%+ success rate over 5+ occurrences, Ghost Server pushes it to the Ghost Client as a new local rule. The client then fixes it instantly without network round-trips. This is how Ghost gets faster over time.

### LLM Orchestrator

Talks to Ollama on KVM2:

- Sends error context + stack trace + app state snapshot
- Includes relevant knowledge base entries (similar past errors)
- Lists available fix actions (what Ghost Client can execute)
- Asks Qwen: diagnose root cause, suggest fix action, rate confidence
- Prompt caching: identical error patterns within a time window reuse cached analysis

### Fix Command System

Commands sent to Ghost Client via WebSocket:

| Command type        | Example                                               |
| ------------------- | ----------------------------------------------------- |
| `state_patch`       | Update Zustand store values directly                  |
| `restart_subsystem` | Restart audio engine, video pipeline, WebSocket       |
| `clear_cache`       | Purge specific IndexedDB entries, waveform cache      |
| `reload_component`  | Force re-mount a React component tree                 |
| `retry_operation`   | Re-attempt a failed operation with modified params    |
| `notify_user`       | Last resort — surface a message if nothing else works |

### Notifications

| Trigger                                      | Email (Resend) | Telegram Bot |
| -------------------------------------------- | -------------- | ------------ |
| **Critical failure** (3 failed fix attempts) | Yes            | Yes          |
| **Daily digest**                             | Yes            | No           |
| **Weekly report**                            | Yes            | No           |

Telegram gets urgent alerts only. Email gets everything.

**Telegram alert format:**

```
🔴 Ghost Alert
DJ App — DeckA audio engine crashed
3 fix attempts failed. Needs manual intervention.
Error: AudioContext closed unexpectedly during stream
Session: app.videodj.studio | 2026-04-07 22:15 UTC
```

---

## Admin Dashboard (admin.videodj.studio)

Separate Next.js app deployed via Dokploy on KVM4. Dark theme matching the DJ app (`#14141f` background, `#2a2a3e` borders, `#ffff00` brand yellow).

### Ghost Panel

| View                       | What it shows                                                              |
| -------------------------- | -------------------------------------------------------------------------- |
| **Heartbeat**              | Live pulse — green/amber/red. Current status + uptime counter              |
| **Live feed**              | Real-time stream of events Ghost is processing. Filterable by severity     |
| **Error log**              | Full history of captured errors. Search, filter by component/severity/date |
| **Fix history**            | Every fix attempted — what, when, success/fail, auto or LLM-assisted       |
| **Knowledge base browser** | All learned patterns. Error→fix mappings, success rates, promotion status  |
| **Promoted rules**         | Client-side rules Ghost auto-generated from learned patterns               |
| **Notifications log**      | History of all emails and Telegram alerts sent                             |

### Linus Panel

| View                     | What it shows                                          |
| ------------------------ | ------------------------------------------------------ |
| **Conversation history** | All Linus chat sessions with users                     |
| **API usage**            | Request count, tokens used, response times, error rate |
| **Model config**         | Current model/provider, switch between models live     |
| **Command stats**        | Most used slash commands, success/fail rates           |

### System Panel

| View                    | What it shows                                              |
| ----------------------- | ---------------------------------------------------------- |
| **KVM4 health**         | CPU, RAM, disk, network for the Dokploy server             |
| **KVM2 health**         | CPU, RAM, GPU usage on the Ollama server                   |
| **Ollama status**       | Model loaded, inference queue, avg response time, uptime   |
| **App instances**       | Connected DJ app sessions — who's online, session duration |
| **Stream monitor**      | Active RTMP streams, bitrate, dropped frames, uptime       |
| **Dokploy deployments** | Status of all deployed services (DJ app, Ghost, Admin)     |

### Auth

Single admin login (email + password, session-based). Expandable to role-based access for SaaS.

---

## Autonomy Level

**Full autonomy.** Ghost tries to fix everything it encounters. It only alerts you (email + Telegram) when it fails after 3 attempts. Over time, it builds a knowledge base of error→fix patterns and promotes high-confidence fixes to client-side rules for instant resolution.

---

## Tech Stack

| Component       | Tech                                                         |
| --------------- | ------------------------------------------------------------ |
| Ghost Client    | TypeScript module inside Next.js/Electron app                |
| Ghost Server    | Node.js + Express/Fastify API                                |
| Admin Dashboard | Next.js + React                                              |
| Database        | PostgreSQL (knowledge base, logs, analytics)                 |
| LLM             | Ollama + Qwen 2.5 Coder 32B on KVM2                          |
| Notifications   | Resend (email) + Telegram Bot API                            |
| Deployment      | Dokploy on KVM4                                              |
| Communication   | REST + WebSocket (client ↔ server)                           |
| Auth            | Session-based (admin dashboard) + API keys (client → server) |
