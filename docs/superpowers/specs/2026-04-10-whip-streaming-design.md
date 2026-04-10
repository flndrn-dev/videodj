# WHIP Streaming for Twitch — Zero Server Cost

## Summary

Replace the broken FFmpeg server-relay streaming pipeline with browser-native WHIP (WebRTC-HTTP Ingestion Protocol) that pushes directly from the browser to Twitch. No server involvement, no bandwidth cost on the VPS.

## Constraints

- Zero streaming cost on VPS — all data flows browser → Twitch directly
- Twitch only (YouTube dropped until they support WHIP)
- Keep existing StreamDashboard UI (stream key, resolution, bitrate, overlay controls)
- Keep existing StreamCompositor (canvas compositing, audio mixing, Now Playing overlay)

## Architecture

```
StreamCompositor (canvas + Web Audio)
        |
  MediaStream (video + audio tracks)
        |
  RTCPeerConnection (H.264 + Opus)
        |
  WHIP POST -> https://ingest.twitch.tv/v1/whip
        |
  Twitch Live
```

## New Component: WHIPClient

Location: `web/app/lib/whipClient.ts`

### Responsibilities

- Accept a MediaStream (from StreamCompositor) and Twitch stream key
- Create RTCPeerConnection with H.264 preferred codec
- Add video + audio tracks from MediaStream
- Create SDP offer
- POST offer to Twitch WHIP endpoint with Bearer auth
- Receive and apply SDP answer
- Handle ICE candidates (Trickle ICE via PATCH or bundled)
- Expose: `start(stream, streamKey)`, `stop()`, `getState()`
- Emit connection state changes for UI updates

### WHIP Protocol Flow

1. Create RTCPeerConnection
2. Add MediaStream tracks (video from canvas, audio from Web Audio)
3. Create SDP offer
4. HTTP POST to `https://ingest.twitch.tv/v1/whip`
   - Header: `Authorization: Bearer {stream_key}`
   - Header: `Content-Type: application/sdp`
   - Body: SDP offer string
5. Receive 201 Created with SDP answer in body
6. Set remote description from answer
7. Handle any ICE candidates from `Link` headers (Trickle ICE)
8. Connection established — stream is live

### Codec Preference

Prefer H.264 for video (Twitch requires it). Set via `RTCRtpSender.setParameters()` or SDP munging to prioritize H.264 over VP8/VP9. Audio uses Opus (WebRTC default, Twitch supports it).

### Bitrate Control

Use `RTCRtpSender.setParameters()` to set `maxBitrate` on the video sender, matching the user's bitrate selection from the UI (2500-6000 kbps).

### Error Handling

- WHIP POST failure (401) → invalid stream key, show error in UI
- WHIP POST failure (network) → Twitch unreachable, show error
- ICE connection failed → network/firewall issue, show error
- RTCPeerConnection disconnected → attempt reconnect once, then show error

## StreamDashboard Changes

File: `web/components/StreamDashboard.tsx`

### Remove

- YouTube platform option (entire platform selector)
- FFmpeg installation check (`check-ffmpeg` API call, `ffmpegInstalled` state)
- `StreamRecorder` usage and base64 chunk sending logic
- All `/api/stream` fetch calls

### Add

- Import and use WHIPClient
- GO LIVE: `compositor.start()` → get MediaStream → `whipClient.start(stream, key)`
- STOP: `whipClient.stop()` → `compositor.stop()`
- Connection state from `RTCPeerConnection.connectionState` for status indicator

### Keep

- Stream key input (localStorage persistence)
- Resolution selector (720p/1080p)
- Bitrate slider (2500-6000 kbps)
- Overlay toggle + position selector
- Preview canvas
- Duration counter
- Status indicators (offline/connecting/live/error)

## Files to Delete

- `web/app/api/stream/route.ts` — FFmpeg server relay, no longer needed
- `web/stream-server.mjs` — WebSocket FFmpeg bridge, no longer needed

## Files to Modify

- `web/app/lib/streamCapture.ts` — Remove `StreamRecorder` class (replaced by WHIPClient)
- `web/components/StreamDashboard.tsx` — Swap FFmpeg relay for WHIPClient
- `web/components/Header.tsx` — No changes needed (STREAM button stays)

## Files to Create

- `web/app/lib/whipClient.ts` — WHIP protocol client

## StreamCompositor Fix

The existing `StreamCompositor.start()` never calls `initAudio()`, resulting in video-only streams. This must be fixed — `start()` should call `initAudio()` before capturing the MediaStream.

## Testing

- Manual: connect to Twitch with a valid stream key, verify video + audio
- Verify H.264 codec negotiation in browser DevTools (chrome://webrtc-internals)
- Test error states: invalid key, network disconnect, stop/restart
