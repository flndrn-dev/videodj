# videoDJ.Studio — GOTCHA Goals

| # | Goal | Description | Status |
|---|------|-------------|--------|
| G1 | Video Library Scanner | Recursively scan folders for video files (.mp4, .mkv, .avi, etc.) | Implemented |
| G2 | Metadata Extraction | Extract title, artist, BPM, language from video files using music-metadata + ffprobe | Implemented |
| G3 | Dutch Language Detection | 3-tier detection: metadata tag → known artist list → Whisper CLI | Implemented |
| G4 | BPM Detection | Compute BPM via aubio → ffmpeg WAV → energy peak analysis | Implemented |
| G5 | Smart Playlist Builder | SQLite + BPM transition sorting + artist repeat window + energy curves | Implemented |
| G6 | AI Agent Orchestrator | Claude-powered command understanding with mock fallback | Implemented |
| G7 | Web App | Next.js 15 + React 19 + Tailwind CSS v4 DJ interface | Implemented |
| G8 | Deck View | Three.js spinning vinyl discs with Framer Motion animations | Implemented |
| G9 | Command Bar | Natural language chip commands (play dutch music, build auto mix, etc.) | Implemented |
| G10 | Crossfader | Visual crossfader slider between Deck A and Deck B | Implemented |

## Energy Curves

| Curve | Description |
|-------|-------------|
| build | Low BPM → High BPM (ramp up energy over the set) |
| peak | Mid → High → taper back down (classic DJ set arc) |
| natural | No sorting, respect original library order |

## Architecture

```
djstudio/
├── shared/
│   ├── tools/          # agent_orchestrator.js
│   ├── context/        # dutch_artists.md
│   ├── goals/          # manifest.md (this file)
│   ├── args/           # default.json
│   └── memory/         # MEMORY.md
├── desktop/
│   └── tools/          # scan_videos, extract_metadata, detect_dutch,
│                         compute_bpm, build_playlist, set_filter,
│                         play, pause, open_folder_picker
└── web/                # Next.js 15 web application
```
