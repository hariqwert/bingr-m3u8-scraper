# 🤖 AGENTS.md — Bingr M3U8 HLS Stream Scraper Engine

> **Comprehensive Technical Architecture, Reverse-Engineered Network Protocols, and Operational Specifications for Movies, TV Seasons, and Episodes.**

---

## 📑 Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Origin & Anti-Bot Bypass Protocol](#2-origin--anti-bot-bypass-protocol)
3. [Scraper Cluster Directory](#3-scraper-cluster-directory)
4. [Movie Scraping Specification](#4-movie-scraping-specification)
5. [TV Series Scraping Specification (Seasons & Episodes)](#5-tv-series-scraping-specification-seasons--episodes)
6. [HLS CDN Anatomy & Segment Masking](#6-hls-cdn-anatomy--segment-masking)
7. [Automatic Fallback & Cascade Algorithm](#7-automatic-fallback--cascade-algorithm)
8. [Multi-Language Implementation Reference (Node.js, Python, cURL)](#8-multi-language-implementation-reference)
9. [Agentic Guidelines & Maintenance Rules](#9-agentic-guidelines--maintenance-rules)

---

## 1. System Overview & Architecture

`bingr.one` utilizes a distributed backend edge cluster (`https://api.bingr.one/api`) that aggregates and scrapes live streaming media across multiple third-party storage networks, CDNs, and scraper providers.

### High-Level Data Flow:

```
[Client / Agent]
       │
       ├──► 1. Query TMDB Metadata / Episode Index
       │         GET https://api.bingr.one/api/details/tv/:id
       │         GET https://api.bingr.one/api/episodes/:id/:season
       │
       ├──► 2. Dispatch Scraper Request with Origin Headers
       │         POST https://api.bingr.one/api/stream
       │         Payload: { srv, t: "movie" | "tv", id, query }
       │
       ▼
[Bingr Edge API Gateway (api.bingr.one)]
       │
       ├──► Scraper Clusters:
       │      ├─ [s62] Bastion   ──► KNOCW / NXOCW / FLOCW CDN (.m3u8)
       │      ├─ [s40] DarkMatter──► StreamRip 1080p (.m3u8)
       │      ├─ [s70] Polaris   ──► Cloudflare Worker Multi-CDN
       │      └─ [s3]  Edmunds   ──► Filmu Proxy
       ▼
[Tokenized M3U8 HLS Stream + Subtitles]
       ▼
[Direct Playback via Hls.js / VLC / Mobile Player]
```

---

## 2. Origin & Anti-Bot Bypass Protocol

Direct browser requests (`fetch()` from unauthorized origins) to `https://api.bingr.one` return **`403 Forbidden`**. The API enforces strict header verification at Cloudflare / Nginx edge reverse proxies.

### Mandatory Request Headers:
All HTTP requests to `api.bingr.one` must include:

| Header | Required Value | Notes |
| :--- | :--- | :--- |
| **`Origin`** | `https://bingr.one` | Strictly enforced |
| **`Referer`** | `https://bingr.one/watch/...` | Must match watch route context |
| **`User-Agent`** | Standard modern desktop browser string | Avoid automated default headers |
| **`Content-Type`** | `application/json` | Required on `POST /api/stream` |

#### Contextual Referer Generation:
- **For Movies**: `https://bingr.one/watch/movie/${tmdbId}`
- **For TV Episodes**: `https://bingr.one/watch/tv/${tmdbId}/${season}/${episode}`

---

## 3. Scraper Cluster Directory

The Bingr backend delegates scraping to specific server modules identified by server code `srv`:

| Server ID | Cluster Name | Region | Primary Output CDN / Protocol | Reliability |
| :--- | :--- | :--- | :--- | :--- |
| **`s62`** | **Bastion** | IN / Global | `img1.knocw.com`, `img1.nxocw.com`, `img1.flocw.com` | ⭐⭐⭐⭐⭐ (Fastest, High CDN Quality) |
| **`s40`** | **DarkMatter** | Global | `movie.streamrip.fun` (1080p direct HLS) | ⭐⭐⭐⭐ (Clean 1080p, High bitrates) |
| **`s70`** | **Polaris** | US | Workers proxy + `sacdn.hakunaymatata.com` | ⭐⭐⭐⭐ (Multi-source redundancy) |
| **`s3`** | **Edmunds** | US | `wormhole.filmu.in/proxy/m3u8` | ⭐⭐⭐ (Proxy HLS, good fallback) |
| **`s60`** | **Vertex** | US | Secondary mirror cluster | ⭐⭐⭐ |
| **`s30`** | **Nova** | US | Auxiliary scraper | ⭐⭐ (Frequent timeouts) |
| **`s31`** | **Orion** | US | Auxiliary scraper | ⭐⭐ |

---

## 4. Movie Scraping Specification

### Step 1: TMDB Movie Metadata (Optional but Recommended)
To retrieve the movie's official title and release year for exact query matching:

```http
GET https://api.bingr.one/api/details/movie/1108427 HTTP/1.1
Host: api.bingr.one
Origin: https://bingr.one
Referer: https://bingr.one/
```

**Response Sample:**
```json
{
  "id": 1108427,
  "type": "movie",
  "title": "Kill",
  "year": "2024",
  "poster": "https://image.tmdb.org/t/p/w500/gaet1xQ2nxrG0V1Ep9T20ZMNEIC.jpg",
  "backdrop": "https://image.tmdb.org/t/p/w1280/c6BPbkO5Npt1OdwttAxCF.jpg",
  "overview": "When army commando Amrit finds out his true love...",
  "runtime": 105
}
```

### Step 2: Stream Extraction Request

```http
POST https://api.bingr.one/api/stream HTTP/1.1
Host: api.bingr.one
Origin: https://bingr.one
Referer: https://bingr.one/watch/movie/1108427
Content-Type: application/json

{
  "srv": "s62",
  "t": "movie",
  "id": 1108427,
  "query": {
    "title": "Kill",
    "year": "2024"
  }
}
```

**Response Sample:**
```json
{
  "scraperName": "Bastion",
  "sources": [
    {
      "url": "https://img1.knocw.com/myhls_mps/2024/7yue/Kill_Hindi_720/index_338.m3u8?auth_key=ZVhYr3ij4RVSBBKCfAaXb6DekFkyrbDiEYPo%2BF1kDmM%3D&expire=1789070151646",
      "quality": "720p",
      "type": "application/x-mpegurl",
      "label": "Bastion #0",
      "name": "720p"
    }
  ],
  "subtitles": []
}
```

---

## 5. TV Series Scraping Specification (Seasons & Episodes)

TV series require a **3-tier resolution sequence**:
1. Show Discovery & Seasons Count
2. Season Episode Enumeration
3. Targeted Episode Stream Scraping

### Level 1: TV Show Metadata & Seasons Discovery
```http
GET https://api.bingr.one/api/details/tv/1396 HTTP/1.1
Host: api.bingr.one
Origin: https://bingr.one
Referer: https://bingr.one/
```

**Response Sample:**
```json
{
  "id": 1396,
  "type": "tv",
  "title": "Breaking Bad",
  "year": "2008",
  "seasons": [
    { "season": 1, "episodes": 7 },
    { "season": 2, "episodes": 13 },
    { "season": 3, "episodes": 13 },
    { "season": 4, "episodes": 13 },
    { "season": 5, "episodes": 16 }
  ]
}
```

### Level 2: Enumerate Season Episodes
Fetch episode numbers, titles, overviews, and stills for Season `N`:

```http
GET https://api.bingr.one/api/episodes/1396/1 HTTP/1.1
Host: api.bingr.one
Origin: https://bingr.one
Referer: https://bingr.one/watch/tv/1396/1/1
```

**Response Sample:**
```json
{
  "episodes": [
    {
      "episode": 1,
      "title": "Pilot",
      "overview": "When an unassuming high school chemistry teacher...",
      "still": "https://image.tmdb.org/t/p/w300/88Z0fMP8a88EpQWMCs1593G0ngu.jpg",
      "air_date": "2008-01-20",
      "rating": 8.485
    },
    {
      "episode": 2,
      "title": "Cat's in the Bag...",
      "overview": "Walt and Jesse attempt to clean up...",
      "still": "https://image.tmdb.org/t/p/w300/r54N1y37FfF4rQW99zUuR.jpg",
      "air_date": "2008-01-27",
      "rating": 8.237
    }
  ]
}
```

### Level 3: Scrape Specific Episode Stream
To scrape Season `1`, Episode `1`:

```http
POST https://api.bingr.one/api/stream HTTP/1.1
Host: api.bingr.one
Origin: https://bingr.one
Referer: https://bingr.one/watch/tv/1396/1/1
Content-Type: application/json

{
  "srv": "s62",
  "t": "tv",
  "id": 1396,
  "query": {
    "title": "Breaking Bad",
    "year": "2008",
    "season": 1,
    "episode": 1
  }
}
```

**Response Sample:**
```json
{
  "scraperName": "Bastion",
  "sources": [
    {
      "url": "https://img1.flocw.com/hls_mps/57ba6bd962339881cd96be7ca2b42efec15f8b8e/720/index_306.m3u8?auth_key=3%2B4dD4Hpb0V9rCpVut3MlUfWw7ECGlYh0ekOD4nJ3EA%3D&expire=1789071117842",
      "quality": "720p",
      "type": "application/x-mpegurl"
    },
    {
      "url": "https://img1.hoxcv.com/hls_mps/57ba6bd962339881cd96be7ca2b42efec15f8b8e/480/index_323.m3u8?auth_key=s1OUEvWVa5kFHCm4%2BnBoHRqJkwEiME1eEV%2F0rFqmY3Q%3D&expire=1789071117462",
      "quality": "480p",
      "type": "application/x-mpegurl"
    }
  ],
  "subtitles": []
}
```

---

## 6. Live Sports Scraping Specification (Matches & Streams)

Bingr integrates an active sports scraping subsystem for live and upcoming athletic fixtures (Cricket, Football/Soccer, Tennis, Rugby, Golf, AFL, etc.).

### Step 1: Discover Today's Live and Upcoming Matches

```http
GET https://api.bingr.one/api/sports/matches/all-today HTTP/1.1
Host: api.bingr.one
Origin: https://bingr.one
Referer: https://bingr.one/sports
```

**Response Structure:**
```json
[
  {
    "id": "247-willow",
    "title": "Willow Cricket",
    "category": "cricket",
    "date": 1789061144985,
    "teams": {
      "home": { "name": "Willow", "badge": "" },
      "away": { "name": "", "badge": "" }
    },
    "sources": [
      { "source": "solaris", "id": "247-willow" }
    ]
  },
  {
    "id": "ucl/2026-09-10/fen-roma",
    "title": "Fenerbahce vs AS Roma",
    "category": "football",
    "date": 1789061144985,
    "teams": {
      "home": { "name": "Fenerbahce", "badge": "..." },
      "away": { "name": "AS Roma", "badge": "..." }
    },
    "sources": [
      { "source": "solaris", "id": "ucl/2026-09-10/fen-roma" }
    ]
  }
]
```

### Step 2: Extract Live Match HLS Stream

To scrape the live video sources for a match using its `source` and `id`:

```http
GET https://api.bingr.one/api/sports/stream/solaris/247-willow HTTP/1.1
Host: api.bingr.one
Origin: https://bingr.one
Referer: https://bingr.one/sports
```

**Response Structure:**
```json
[
  {
    "id": "solaris-0",
    "streamNo": 1,
    "language": "Direct CDN",
    "hd": false,
    "embedUrl": "https://sports.streamrip.fun/proxy/m3u8?url=https%3A%2F%2Fmessi.damitv.st%2Flive-hls%2Fchannel%2F247-willow%2Fplaylist.m3u8...",
    "source": "Main Stream (Direct CDN)"
  },
  {
    "id": "solaris-1",
    "streamNo": 2,
    "language": "English",
    "hd": false,
    "embedUrl": "https://embedindia.st/embed/247-willow?gid=...",
    "source": "Main Stream · Embed"
  }
]
```

#### Live Sports M3U8 Stream Format:
The returned `embedUrl` containing `proxy/m3u8?url=...` is a direct, live Apple HLS playlist serving real-time video chunks with `Access-Control-Allow-Origin: *`.

---

## 7. HLS CDN Anatomy & Segment Masking

The extracted HLS playlists use advanced CDN architectures designed for edge caching:

### 1. Structure of Scraped M3U8 Playlists:
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:3.128122,
https://img.nxocw.com/hls_mps/43110932bb55675ccad49b1bd15a26cfd03941b8/720/0.jpg?t=1782550736
#EXTINF:3.086422,
https://img.nxocw.com/hls_mps/43110932bb55675ccad49b1bd15a26cfd03941b8/720/1.jpg?t=1782550736
```

### 2. Segment Disguising Technique:
- The segment URIs end with `.jpg` (e.g. `0.jpg`, `1.jpg`) rather than `.ts`.
- **Payload Reality**: Each `.jpg` file is actually a pure **MPEG-2 Transport Stream (MPEG-TS)** chunk.
- **Sync Byte Verification**: Inspecting byte 0 of any segment confirms the standard MPEG-TS sync byte:
  ```
  Byte 0: 0x47  (Hex: 47 40 11 10...)
  ```
- **Browser Compatibility**: Both Apple HLS native players (iOS / Safari) and JavaScript MSE players (`hls.js`, `video.js`) parse these `.jpg` video chunks natively without transcoding.

### 3. Open CORS Headers:
Unlike the scraping gateway (`api.bingr.one`), the video CDNs (`img1.nxocw.com`, `img1.knocw.com`, `img1.flocw.com`) serve:
```http
Access-Control-Allow-Origin: *
```
This enables direct client-side playback without proxying video bandwidth through your own server.

---

## 7. Automatic Fallback & Cascade Algorithm

If a specific cluster is down or under maintenance, the scraper cascades automatically:

```javascript
const SERVERS = ['s62', 's40', 's70', 's3', 's60'];

for (const srv of SERVERS) {
  const result = await queryServer(srv, mediaType, tmdbId, query);
  if (result && result.sources && result.sources.length > 0) {
    return result; // First successful working stream found
  }
}
// If all primary scrapers fail, return embed fallback URLs
return fallbackEmbeds;
```

---

---

## 8. Multi-Audio & Multi-Language Architecture

A common question when scraping M3U8 streams is: **Why does the audio track selector in standard HLS players stay empty?**

### The Root Cause: Pre-Muxed vs Master HLS Streams

Bingr uses multiple backend server clusters with fundamentally different encoding pipelines:

#### 1. Pre-Muxed Streams (`s62` Bastion / `img1.nxocw.com` CDN)
- When scraping default server `s62`, the CDN returns a stream like `Kill_Hindi_720/index_338.m3u8`.
- In this manifest:
  ```m3u8
  #EXTM3U
  #EXT-X-VERSION:3
  #EXT-X-TARGETDURATION:10
  #EXTINF:3.128122,
  https://img.nxocw.com/hls_mps/.../720/0.jpg
  ```
- **No `#EXT-X-MEDIA:TYPE=AUDIO` tags exist.**
- The audio (e.g., Hindi AAC) is **multiplexed directly into the MPEG-TS transport packets** alongside the H.264 video.
- Because there are no separate audio playlists or elementary audio streams, standard web players (`hls.js`, `video.js`) report `hls.audioTracks = []`. You cannot toggle audio tracks inside that single M3U8 file.

#### 2. Multi-Source Language Switching (`s70` Polaris)
- Server `s70` (Polaris) handles multi-audio by returning **distinct stream URLs for each language**:
  ```json
  [
    { "label": "Polaris — English 1080p", "url": "https://sacdn.hakunaymatata.com/.../master.m3u8" },
    { "label": "Polaris — Hindi 1080p", "url": "https://sacdn.hakunaymatata.com/.../hindi_master.m3u8" },
    { "label": "Polaris — Spanish 720p", "url": "https://sacdn.hakunaymatata.com/.../spanish.m3u8" },
    { "label": "Polaris — Russian", "url": "https://sacdn.hakunaymatata.com/.../russian.m3u8" }
  ]
  ```
- Audio switching is performed by switching the active stream URL rather than changing an internal HLS track.

#### 3. True Master HLS Playlists with Multi-Audio Tracks
- Select Polaris streams (HLS v7) include full `#EXT-X-MEDIA:TYPE=AUDIO` definitions:
  ```m3u8
  #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aacl-128",NAME="English",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="en",URI="v3.m3u8"
  #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aacl-128",NAME="Hindi",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="hi",URI="v4.m3u8"
  ```
- In these streams, `hls.js` fires `Hls.Events.AUDIO_TRACKS_UPDATED`, enabling instant in-stream language switching without re-buffering the video.

#### 4. Dedicated Languages Endpoint (`/api/languages/`)
- Querying the dedicated language directory endpoint returns additional localized streams:
  ```http
  GET https://api.bingr.one/api/languages/movie/1108427?title=Kill&year=2024 HTTP/1.1
  Host: api.bingr.one
  Origin: https://bingr.one
  Referer: https://bingr.one/watch/movie/1108427
  ```

---

### Universal Multi-Audio Solution for Web Players

To support all sources seamlessly, CineStream (`bingr-player`) implements a **Dual-Layer Audio Selector**:

```javascript
// Layer 1: Listen for internal HLS multi-audio tracks
hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, data) => {
  if (data.audioTracks && data.audioTracks.length > 1) {
    // Populate dropdown with internal tracks: English, Hindi, etc.
    populateInternalAudioTracks(data.audioTracks);
  }
});

// Layer 2: Fallback to Multi-Source Language Switching
function handleSources(sources) {
  const languageSources = sources.filter(s => s.language || s.label.includes('—'));
  if (languageSources.length > 1) {
    // Populate dropdown with server language streams
    populateStreamLanguageSelector(languageSources);
  }
}
```

---

## 9. Multi-Language Implementation Reference

### A. Node.js Native
```javascript
const scraper = require('./scraper');

// Scrape Movie
const movie = await scraper.scrapeMovie(1108427);
console.log('M3U8:', movie.primaryM3u8);

// Scrape TV Series Episode
const episode = await scraper.scrapeTvEpisode(1396, 1, 1);
console.log('Episode M3U8:', episode.primaryM3u8);
```

### B. Python 3 (`requests`)
```python
import requests

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Referer': 'https://bingr.one/watch/movie/1108427',
    'Origin': 'https://bingr.one'
}

payload = {
    "srv": "s62",
    "t": "movie",
    "id": 1108427,
    "query": {"title": "Kill", "year": "2024"}
}

res = requests.post("https://api.bingr.one/api/stream", json=payload, headers=HEADERS)
data = res.json()
print("M3U8 URL:", data["sources"][0]["url"])
```

### C. Raw cURL
```bash
curl -X POST "https://api.bingr.one/api/stream" \
  -H "Origin: https://bingr.one" \
  -H "Referer: https://bingr.one/watch/movie/1108427" \
  -H "Content-Type: application/json" \
  -d '{"srv":"s62","t":"movie","id":1108427,"query":{"title":"Kill","year":"2024"}}'
```

---

## 10. Agentic Guidelines & Maintenance Rules

When configuring, enhancing, or wrapping this scraper in subagents or automation:

1. **Always Set Referer & Origin**: Never omit `https://bingr.one` headers when communicating with `api.bingr.one`.
2. **Handle Expiration Tokens**: Scraped M3U8 links contain `expire=<timestamp>`. Cached URLs should be renewed if older than 2–4 hours.
3. **Preserve MPEG-TS MIME Types**: When serving or proxying `.m3u8` playlists, set `Content-Type: application/vnd.apple.mpegurl`.
4. **Never Proxy Video Chunks**: Stream segments directly to client browsers to save server compute and bandwidth since origin CDNs provide `Access-Control-Allow-Origin: *`.
5. **Multi-Audio Handling**: When multi-audio is required, prioritize server `s70` (Polaris) or expose stream language switching in UI clients.

