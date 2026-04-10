# videoDJ.Studio — Twitch Streaming Guide

Complete A-Z guide to connect your Twitch account, configure your stream, schedule upcoming streams, and go live with videoDJ.Studio.

---

## Prerequisites

- **Twitch Account** — https://twitch.tv (sign up if you don't have one)
- **FFmpeg installed** — required for RTMP streaming
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
  - Windows: download from https://ffmpeg.org/download.html
- **videoDJ.Studio running** — `npm run dev:web` (localhost:3030)

---

## Step 1: Create a Twitch Application

You need a Twitch Developer App to authenticate from videoDJ.Studio.

1. Go to **https://dev.twitch.tv/console/apps**
2. Log in with your Twitch account
3. Click **"Register Your Application"**
4. Fill in:
   - **Name**: `videoDJ.Studio` (or any name you want)
   - **OAuth Redirect URL**: `http://localhost:3030/api/twitch`
   - **Category**: `Application Integration`
5. Click **"Create"**
6. On the next page, click **"Manage"** on your new app
7. Copy the **Client ID**
8. Click **"New Secret"** and copy the **Client Secret**

> Keep these credentials safe — you'll need them in the next step.

---

## Step 2: Add Twitch Credentials to videoDJ.Studio

1. Open videoDJ.Studio in your browser (localhost:3030)
2. Click the **gear icon** (top-right) to open **Settings**
3. Scroll down to **"Twitch Streaming"** section
4. Paste your **Client ID** and **Client Secret**
5. Click **"Connect with Twitch"**
6. You'll be redirected to Twitch — click **"Authorize"** to grant permissions
7. You'll be redirected back to videoDJ.Studio
8. A green toast notification confirms: **"Connected to Twitch as [your username]"**

### Permissions granted:
- Read and send chat messages
- Read your stream key
- Update stream title, category, and tags
- Manage your stream schedule

---

## Step 3: Open the Stream Preview

1. Click **"STREAM"** in the top-right header bar
2. The **Stream Preview** panel opens full-screen
3. You'll see:
   - **Stream Setup Bar** (top) — title, category, tags, GO LIVE button
   - **Video Preview** (center) — live composite of your decks
   - **Twitch Chat** (right sidebar) — your channel's chat
   - **Schedule** (bottom of sidebar) — upcoming streams

---

## Step 4: Configure Your Stream

### Stream Title
- Type your stream title in the **STREAM TITLE** field
- Example: `DJ Bodhi — 80s Rock Night`
- This is what viewers see on your Twitch channel page

### Category
- Click the **CATEGORY** field and start typing
- A dropdown shows matching Twitch categories
- Select **"Music"** or **"DJ"** (or any category that fits)
- The field turns purple when a category is selected

### Tags
- Enter comma-separated tags in the **TAGS** field
- Example: `DJ, Music, Live, Rock, 80s`
- Tags help viewers discover your stream

### Auto Now Playing
- Toggle the **NOW PLAYING** button to **AUTO** or **OFF**
- When **AUTO**: every time a track changes on your decks, videoDJ.Studio automatically posts in Twitch chat:
  ```
  🎵 Now Playing: Guns N' Roses — Sweet Child O' Mine
  ```
- Viewers always know what song is playing

### Save to Twitch
- Click **"Update"** to push your title, category, and tags to Twitch
- This updates your channel info immediately — even before going live
- Your Twitch channel page will reflect the changes

---

## Step 5: Schedule Upcoming Streams

In the right sidebar, below the chat:

### Add a Scheduled Stream
1. Type the stream title (e.g. "Saturday Night Rock Mix")
2. Pick a **date** using the date picker
3. Set the **time** (defaults to 20:00)
4. Click **"+ Add to Schedule"**
5. The stream appears on your Twitch channel's schedule

### Manage Scheduled Streams
- Upcoming streams are listed with title, date, and time
- Click **×** next to a stream to remove it from your schedule

### Where viewers see it
- Your Twitch channel page shows the schedule under the "Schedule" tab
- Viewers can set reminders to be notified when you go live

---

## Step 6: Add Cameras (Optional)

1. Click **"+ Camera (0/3)"** in the Stream Preview header
2. Your browser asks for camera permission — click **"Allow"**
3. Your webcam feed appears as a draggable overlay on the preview
4. **Drag** the camera feed to position it anywhere on the stream
5. You can add up to **3 cameras**
6. Click **"X"** on a camera overlay to remove it

---

## Step 7: Go Live

1. Make sure you have:
   - At least one track loaded on a deck and playing
   - Stream title, category, and tags configured
   - FFmpeg installed on your machine
2. Click the green **"GO LIVE"** button
3. videoDJ.Studio:
   - Captures the canvas (deck video + cameras + Now Playing overlay)
   - Captures the mixed audio from both decks
   - Sends it via FFmpeg to Twitch's RTMP server using your stream key
4. The button turns red: **"END STREAM"**
5. Your Twitch channel is now live

### What viewers see:
- The video composite from your decks (crossfade between Deck A and B)
- Camera overlays (if added)
- **Now Playing** bar at the bottom-left with the videoDJ.Studio logo, song title, and artist
- Chat messages from you (auto Now Playing + anything you type)

---

## Step 8: During the Stream

### DJ Controls
- Use the decks normally — play, pause, crossfade, EQ, effects
- Load tracks from the playlist panel
- Use Autoplay or Automix for hands-free mixing

### Twitch Chat
- Chat messages from viewers appear in the right sidebar
- The auto Now Playing feature posts track changes to chat
- (Future: Linus can respond to viewer requests in chat)

### Recording
- Click **"Record"** in the header to save a local copy of the stream
- Click **"Stop Rec"** to finish — a `.webm` file downloads automatically

### Pop Out
- Click **"Pop Out"** to open the stream preview in a separate window
- You can then close the Stream Preview panel and keep DJing
- The pop-out window mirrors the canvas in real-time

---

## Step 9: End the Stream

1. Click the red **"END STREAM"** button
2. FFmpeg stops sending data to Twitch
3. Your Twitch channel goes offline
4. If recording, click **"Stop Rec"** to save the local copy

---

## Troubleshooting

### "Connect" button does nothing
- Make sure your Twitch Client ID and Secret are saved in Settings
- Check the browser console (Cmd+Option+I → Console) for errors
- Verify the redirect URI in your Twitch app is exactly: `http://localhost:3030/api/twitch`

### Stream doesn't start
- Verify FFmpeg is installed: `ffmpeg -version` in terminal
- Check that your stream key was retrieved (look in localStorage for `twitch_stream_key`)
- Make sure a track is loaded and playing before going live

### Chat not connecting
- Re-authenticate: Settings → Twitch → Disconnect → Connect again
- Make sure you authorized the `chat:read` and `chat:edit` scopes

### Now Playing not posting to chat
- Check that **AUTO** is enabled (green button in Stream Setup bar)
- You must be live (GO LIVE active) for auto-posting to work
- Make sure a track is actually playing on a deck

### Category search not working
- Type at least 2 characters to trigger search
- If empty results, your token may have expired — reconnect in Settings

### Schedule not showing
- Twitch schedule requires Affiliate or Partner status
- If you're a new streamer, you may not have access to scheduling yet

---

## Quick Reference

| Action | Where |
|--------|-------|
| Connect Twitch | Settings → Twitch Streaming → Connect |
| Open stream panel | Header → STREAM button |
| Set stream title | Stream Setup Bar → STREAM TITLE |
| Set category | Stream Setup Bar → CATEGORY |
| Auto Now Playing | Stream Setup Bar → NOW PLAYING → AUTO |
| Push to Twitch | Stream Setup Bar → Update |
| Go live | Stream Setup Bar → GO LIVE |
| Add camera | Stream Preview header → + Camera |
| Record locally | Stream Preview header → Record |
| Pop out preview | Stream Preview header → Pop Out |
| Schedule stream | Sidebar → Schedule → Add |
| End stream | Stream Setup Bar → END STREAM |

---

## Stream Key Security

Your Twitch stream key is stored in your browser's localStorage (never sent to any external server except Twitch's RTMP endpoint). For the desktop Electron build, we plan to use the system keychain for added security.

---

*videoDJ.Studio — Built for DJs who stream.*
