# 🚀 Upgrade Guide: Migrating Existing Websites to the New Scraper Engine

> **Target Audience**: Website owners, developers, and platform integrators who already have our previous scraper version and want to upgrade to **4K UHD Streams**, **85+ WebVTT Subtitle Tracks**, **Multi-Language Audio Dubs**, and fix common player display bugs.

---

## 📑 Table of Contents
1. [What's New in This Version](#1-whats-new-in-this-version)
2. [Why Multi-Audio & Subtitles Are Not Listing or Working (Troubleshooting)](#2-why-multi-audio--subtitles-are-not-listing-or-working)
3. [Quick Migration in 3 Steps](#3-quick-migration-in-3-steps)
4. [Backend Upgrade (Node.js, PHP, Python)](#4-backend-upgrade-nodejs-php-python)
5. [Frontend / Player Upgrade (Drop-in Script)](#5-frontend--player-upgrade-drop-in-script)
6. [Server Priority & Auto-Failover Matrix](#6-server-priority--auto-failover-matrix)
7. [Adding Floating "Skip Intro" & "Next Episode" to Your Player](#7-adding-floating-skip-intro--next-episode-to-your-player)

---

## 1. What's New in This Version

| Feature | Previous Scraper Version | New Scraper Engine |
| :--- | :--- | :--- |
| **Top Stream Quality** | 720p / 1080p max (`s62`, `s40`) | **True 4K UHD (3840×2160)** & 1080p (`s4k` PeakStorm) |
| **Subtitle Catching** | Empty array `subtitles: []` or proxy-only | **Direct VDRK Cluster** (up to **89 WebVTT tracks**) with open CORS |
| **Audio Dubs** | Single pre-muxed audio only | **Dual-Layer**: HLS v7 tracks + Multi-source stream switcher |
| **Server Priority** | `s62` (Bastion 720p) first | `s4k` (4K UHD) → `s70` (Dubs) → `s40` (1080p) → `s62` (720p) |
| **HLS Fatal Recovery** | Manual page reload required | **Automatic step-by-step cascade** without user interruption |
| **Skip Intro / Outro** | Not supported / manual seeking | **AniSkip API + TV Heuristic Window (15s–95s)** with auto-floating buttons |

---

## 2. Why Multi-Audio & Subtitles Are Not Listing or Working

Many website owners report:
> *"I updated my scraper, but the subtitle dropdown doesn't show any subtitles, or the audio dropdown only shows one default track!"*

Here are the **exact technical root causes** and their **guaranteed fixes**:

---

### Issue A: Subtitles Fail to Load / Silently Blocked in Player

#### ❌ The Root Cause:
Browser security policies enforce **Cross-Origin Resource Sharing (CORS)** on remote WebVTT subtitle files (`.vtt`). Even though our CDN (`cache.vdrk.site`) sends `Access-Control-Allow-Origin: *`, modern browsers (Chrome, Firefox, Safari) **strictly reject** loading subtitles into a `<video>` tag unless the `<video>` element explicitly includes:
```html
crossorigin="anonymous"
```
Without this attribute, browsers block `<track>` requests silently or log:
`DOMException: Failed to read text tracks because of CORS policy`.

#### ✅ The Fix:
Add `crossorigin="anonymous"` directly to your `<video>` tag:
```html
<!-- INCORRECT (Subtitles will fail) -->
<video id="myPlayer" controls></video>

<!-- CORRECT (Subtitles will work) -->
<video id="myPlayer" controls playsinline crossorigin="anonymous"></video>
```

---

### Issue B: Subtitles Array is Empty (`subtitles: []`)

#### ❌ The Root Cause:
Older implementations only called the stream endpoint (`POST /api/stream`), which frequently returned an empty subtitles array.

#### ✅ The Fix:
Our new engine queries the **Direct VDRK Subtitle Cluster**:
- **Movies**: `https://sub.vdrk.site/v1/movie/{tmdbId}`
- **TV Shows**: `https://sub.vdrk.site/v1/tv/{tmdbId}/{season}/{episode}`

This returns an array of direct WebVTT files across 85+ languages with open CORS headers. In `scraper.js`, this lookup is now **100% automated**.

---

### Issue C: Multi-Audio Selector Shows Only 1 Track or Stays Empty

#### ❌ The Root Cause:
In video streaming, there are two fundamentally different ways audio is delivered:

1. **Pre-Muxed Streams (`s62` Bastion)**:
   The audio (e.g. Hindi or English AAC) is multiplexed directly into the MPEG-TS video container packets. **There are no separate audio track playlists inside the M3U8.** Therefore, `hls.audioTracks` reports an empty array (`[]`). If your player only checks `hls.audioTracks`, your dropdown will be empty!
2. **Multi-Source Stream Switching (`s70` Polaris)**:
   The scraper returns multiple different M3U8 URLs (one for English, one for Hindi, one for Spanish, etc.).
3. **In-Manifest HLS v7 Tracks (`s70` / `s4k`)**:
   Master playlists that contain `#EXT-X-MEDIA:TYPE=AUDIO` tags, allowing instant in-stream track toggling.

#### ✅ The Fix: Implement the Dual-Layer Audio Pattern:
Your web player must check **both**:
- **Layer 1 (In-Manifest)**: Listen for `Hls.Events.AUDIO_TRACKS_UPDATED`.
- **Layer 2 (Stream-Level Fallback)**: If in-manifest tracks are not present, populate your dropdown with the alternate language streams returned in the scraper's `sources` array.

---

## 3. Quick Migration in 3 Steps

If your website is already live:

1. **Replace `scraper.js`**: Copy the latest `scraper.js` into your backend repository.
2. **Add `crossorigin="anonymous"`**: Update your frontend `<video>` tag.
3. **Copy the Drop-in Player Script**: Use our updated Hls.js initialization code (Section 5) that automatically handles 4K, subtitles, and audio dubs.

---

## 4. Backend Upgrade (Node.js, PHP, Python)

### If using Node.js:
Replace your local `scraper.js`. The response format is 100% backwards-compatible:

```javascript
const scraper = require('./scraper');

// Scrape Movie (defaults to s4k 4K UHD, cascades automatically)
const result = await scraper.scrapeMovie(1108427);

console.log(result.primaryM3u8); // Direct 4K Master M3U8 (moon.peakstorm.top)
console.log(result.quality);     // '4K / Auto'
console.log(result.sources);     // [4K, 1080p, 720p, 480p]
console.log(result.subtitles);   // Array of { url, lang, label } (85+ languages)
```

### If using PHP:
Update your scraping logic or use the updated `play.php` directly:
- Set default server `$currentSrv = 's4k';`
- If using curl, use the direct VDRK subtitle URL:
```php
$vdrkUrl = "https://sub.vdrk.site/v1/{$type}/{$tmdbId}" . ($type === 'tv' ? "/{$season}/{$episode}" : "");
$ch = curl_init($vdrkUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['User-Agent: Mozilla/5.0']);
$subs = json_decode(curl_exec($ch), true);
curl_close($ch);
```

---

## 5. Frontend / Player Upgrade (Drop-in Script)

Replace your existing video player initialization with this complete, drop-in JavaScript code:

```html
<!-- 1. Video Tag with CORS attribute -->
<video id="videoPlayer" controls playsinline crossorigin="anonymous" style="width:100%; aspect-ratio:16/9; background:#000;"></video>

<!-- 2. UI Controls: Audio Dub, Subtitles, Quality -->
<div style="display:flex; gap:10px; margin-top:8px;">
  <!-- Audio Dub Selector -->
  <select id="audioSelect" onchange="switchAudio(this.value)">
    <option value="-1">Audio: Default</option>
  </select>

  <!-- Subtitles Selector -->
  <select id="subtitleSelect" onchange="switchSubtitle(this.value)">
    <option value="off">Subtitles: Off</option>
  </select>

  <!-- Quality Selector -->
  <select id="qualitySelect" onchange="switchQuality(this.value)">
    <option value="-1">Quality: Auto (4K)</option>
  </select>
</div>

<!-- 3. Player Script -->
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>
<script>
let hls = null;
let currentSources = [];
let currentSubtitles = [];

function loadStream(sources, subtitles) {
  const video = document.getElementById('videoPlayer');
  currentSources = sources;
  currentSubtitles = subtitles || [];

  // A. INJECT SUBTITLES AS <track> ELEMENTS
  video.querySelectorAll('track').forEach(t => t.remove());
  const subSelect = document.getElementById('subtitleSelect');

  if (currentSubtitles.length > 0) {
    subSelect.innerHTML = '<option value="off">Subtitles: Off</option>';
    currentSubtitles.forEach((sub, idx) => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = sub.label || sub.lang;
      track.srclang = sub.lang || 'en';
      track.src = sub.url;
      video.appendChild(track);

      const opt = document.createElement('option');
      opt.value = idx;
      opt.innerText = `CC: ${sub.label || sub.lang}`;
      subSelect.appendChild(opt);
    });
  } else {
    subSelect.innerHTML = '<option value="off">No Subtitles</option>';
  }

  // B. POPULATE DUB LANGUAGE SELECTOR (Stream-Level Fallback)
  const audioSelect = document.getElementById('audioSelect');
  const langStreams = sources.filter(s => s.language || (s.label && s.label.includes('—')));
  if (langStreams.length > 1) {
    audioSelect.innerHTML = '';
    langStreams.forEach((src, idx) => {
      const opt = document.createElement('option');
      opt.value = `src_${idx}`;
      opt.innerText = `Audio: ${src.label || src.language}`;
      audioSelect.appendChild(opt);
    });
  }

  // C. ATTACH HLS.JS
  const primaryUrl = sources[0].url;
  if (hls) hls.destroy();

  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(primaryUrl);
    hls.attachMedia(video);

    // Populate Quality Selector
    hls.on(Hls.Events.MANIFEST_PARSED, (e, data) => {
      const qSelect = document.getElementById('qualitySelect');
      if (data.levels && data.levels.length > 1) {
        qSelect.innerHTML = '<option value="-1">Quality: Auto (4K)</option>';
        data.levels.forEach((lvl, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.innerText = `${lvl.height}p (${Math.round(lvl.bitrate/1000)} kbps)`;
          qSelect.appendChild(opt);
        });
      }
      video.play().catch(() => {});
    });

    // Layer 1: In-manifest HLS audio tracks
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (e, data) => {
      if (data.audioTracks && data.audioTracks.length > 1) {
        audioSelect.innerHTML = '';
        data.audioTracks.forEach((t, idx) => {
          const opt = document.createElement('option');
          opt.value = `hls_${idx}`;
          opt.innerText = `Audio: ${t.name || t.lang || `Track ${idx + 1}`}`;
          audioSelect.appendChild(opt);
        });
      }
    });

    // Step-by-Step Auto Failover on HLS fatal error
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn('[CASCADE] Fatal error encountered:', data.details);
        // Step to next available server in cascade
        if (typeof onHlsFatalError === 'function') {
          onHlsFatalError();
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = primaryUrl;
  }
}

// Subtitle Switcher
function switchSubtitle(trackIdx) {
  const video = document.getElementById('videoPlayer');
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = (trackIdx !== 'off' && i === parseInt(trackIdx)) ? 'showing' : 'disabled';
  }
}

// Audio Switcher
function switchAudio(val) {
  if (val.startsWith('hls_')) {
    if (hls) hls.audioTrack = parseInt(val.replace('hls_', ''));
  } else if (val.startsWith('src_')) {
    const idx = parseInt(val.replace('src_', ''));
    if (currentSources[idx] && hls) {
      hls.loadSource(currentSources[idx].url);
      hls.attachMedia(document.getElementById('videoPlayer'));
    }
  }
}

// Quality Switcher
function switchQuality(val) {
  if (hls) hls.currentLevel = parseInt(val);
}
</script>
```

---

## 6. Server Priority & Auto-Failover Matrix

To ensure that **Quality**, **Multi-Audio**, and **Subtitles** are always prioritized, your integration should adhere to this priority order:

```
Priority 1: [ s4k ]  PeakStorm 4K (3840×2160 UHD & 1080p, Open CORS)
      │
      ▼ (If 4K server offline or HLS fatal error)
Priority 2: [ s70 ]  Polaris (Multi-Language Audio Dubs & HLS v7 Tracks)
      │
      ▼ (If Polaris fails)
Priority 3: [ s40 ]  DarkMatter (StreamRip 1080p High Bitrate)
      │
      ▼ (If DarkMatter fails)
Priority 4: [ s62 ]  Bastion (KNOCW / NXOCW 720p Adaptive Fallback)
      │
      ▼ (If Bastion fails)
Priority 5: [ s3 ]   Edmunds (Filmu Proxy Fallback)
      │
      ▼
Priority 6: [ s60 ]  Vertex (Mirror Cluster)
      │
      ▼
Priority 7: [ s61 ]  Corvus (Secondary Mirror)
      │
      ▼
Priority 8: [ s30 ]  Nova (Auxiliary Scraper)
      │
      ▼
Priority 9: [ s31 ]  Orion (Auxiliary Scraper)
      │
      ▼
Fallback:   [ Embeds ] (Videasy / Filmu / Vidbolt iframes)
```

By following this order across all 9 server clusters, your users always receive the highest possible video resolution and maximum audio/subtitle choices first, with 100% resilient fallback.

---

## 7. Adding Floating "Skip Intro" & "Next Episode" to Your Player

To provide a modern streaming experience (similar to Netflix / Crunchyroll), our updated engine includes **Skip Intro & Outro Timestamps**:

### A. How Timestamps Work
- **Anime**: Retrieved from **AniSkip API** (`api.aniskip.com`), giving exact second-accurate start/end timestamps for opening (`op`) and ending (`ed`) themes.
- **TV Series & Movies**: Uses a smart heuristic window (seconds 15 to 95) or chapter metadata.

### B. Quick CLI Test
```bash
# Query Anime Skip Timestamps (Naruto Shippuden Ep 1)
node cli.js skip 1735 1
# Output: Opening (Intro): 513s - 603s (Skip: +90s)

# Query TV Series (Default Heuristic Window)
node cli.js skip 1396 1
# Output: Standard TV Intro window: 15s - 95s (+80s skip)
```

### C. Player Integration (HTML + JS)
In your video container:
```html
<div style="position:relative;">
  <video id="videoPlayer" controls playsinline crossorigin="anonymous"></video>

  <!-- Floating Skip Intro Button -->
  <button id="skipIntroBtn" onclick="skipIntro()" style="display:none; position:absolute; bottom:60px; right:20px; z-index:30; background:rgba(124,58,237,0.9); color:#fff; padding:8px 16px; border-radius:10px; font-weight:bold; cursor:pointer;">
    ⏭️ Skip Intro
  </button>
</div>

<script>
let hasSkipped = false;
let introStart = 15;
let introEnd = 95;

video.addEventListener('timeupdate', () => {
  const cur = video.currentTime;
  const btn = document.getElementById('skipIntroBtn');
  if (!hasSkipped && cur >= introStart && cur <= introEnd) {
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }
});

function skipIntro() {
  hasSkipped = true;
  video.currentTime = introEnd;
  document.getElementById('skipIntroBtn').style.display = 'none';
}
</script>
```
