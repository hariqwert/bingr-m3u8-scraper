# 🤖 AGENTS.md — Anime M3U8 HLS Stream Scraper Engine

> **Comprehensive Technical Architecture, Reverse-Engineered Network Protocols, and Operational Specifications Exclusively for Anime Streams (5-Server Cluster + AniSkip Engine).**

---

## 📑 Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Ryuu Gateway Authentication & Anti-Bot Protocol](#2-ryuu-gateway-authentication--anti-bot-protocol)
3. [The 5 Anime Scraper Server Clusters](#3-the-5-anime-scraper-server-clusters)
4. [Anime Metadata & Episode Indexing](#4-anime-metadata--episode-indexing)
5. [Fallback Architecture: AnimeSalt Multi-Audio Engine](#5-fallback-architecture-animesalt-multi-audio-engine)
6. [AniSkip Automated Skip Intro & Outro Architecture](#6-aniskip-automated-skip-intro--outro-architecture)
7. [Subtitle Extraction & WebVTT Handling](#7-subtitle-extraction--webvtt-handling)
8. [Player Integration & Dynamic Skip Event Lifecycle](#8-player-integration--dynamic-skip-event-lifecycle)
9. [REST Microservice API Specification](#9-rest-microservice-api-specification)
10. [Command-Line Interface (`anime_cli.js`)](#10-command-line-interface-anime_clijs)
11. [Speed Race & Latency Optimization](#11-speed-race--latency-optimization)
12. [Agentic Guidelines & Operational Maintenance Rules](#12-agentic-guidelines--operational-maintenance-rules)

---

## 1. System Overview & Architecture

This scraper is a specialized, zero-dependency streaming extraction engine designed **exclusively for Anime**. It reverse-engineers the anime pipeline used by high-performance streaming frontends, bypassing cloud security barriers to retrieve direct HLS (`.m3u8`) master playlists.

### High-Level Anime Data Flow:

```
[Client / Player / CLI]
       │
       ├──► 1. Query AniList / Bingr Anime Metadata & Episode Index
       │         POST https://graphql.anilist.co (title, cover, MAL ID, score)
       │         GET  https://api.bingr.one/api/anime/:id/episodes?chunk=:chunk
       │
       ├──► 2. Acquire Ryuu Gateway Session Token
       │         POST https://hianime.filmu.in/token
       │         Returns: { token: "eyJhbGciOi..." } (JWT with 2h expiration)
       │
       ├──► 3. Extract 5-Server Anime Stream Cluster
       │         GET  https://hianime.filmu.in/ryuu/streams?anilistId=:id&ep=:ep&type=sub|dub
       │         Headers: x-api-key: <token>
       │         │
       │         ├── [beep] AnimeApps CDN (cached direct .m3u8)
       │         ├── [yuki] MegaPlay / NexaBloom (multi-language sub HLS master)
       │         ├── [neko] BibiEmbed / Cloudflare Edge Workers (.m3u8)
       │         ├── [zuna] AniWatch / ZokoAnime / HiAnime master
       │         └── [loli] EchoVideo CDN direct stream
       │
       └──► 4. Query Automated AniSkip Opening / Ending Intervals
                 GET  https://api.aniskip.com/v2/skip-times/:idMal/:ep?types[]=op&types[]=ed&episodeLength=0
                 Returns: [{ start, end, type: "op"|"ed", label: "Skip Intro"|"Skip Ending" }]
```

---

## 2. Ryuu Gateway Authentication & Anti-Bot Protocol

The anime scraper cluster requires edge gateway authentication via `hianime.filmu.in`. Direct unauthenticated requests to stream endpoints result in `401 Unauthorized` (`NO_TOKEN`).

### Step 1: Session Token Acquisition
```http
POST https://hianime.filmu.in/token HTTP/1.1
Host: hianime.filmu.in
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
```

#### Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpcCI6IjE2Mi4xNTguMTYzLjIyMyIsImlhdCI6MTc4OTIzOTMzNiwiZXhwIjoxNzg5MjUwMTM2fQ..."
}
```
* **Payload**: Includes client IP binding and a 2.5-hour expiration timestamp.
* **Token Caching**: Tokens are cached in-memory and renewed automatically upon expiry.

### Step 2: Stream Request Header
All downstream stream requests must pass the token in the `x-api-key` header:
```http
x-api-key: eyJhbGciOiJIUzI1Ni...
```

---

## 3. The 5 Anime Scraper Server Clusters

When an episode is requested, the engine resolves streams across **5 specialized anime providers**:

| Server | Origin Provider | Stream Format | Subtitle Support | Characteristics |
| :--- | :--- | :--- | :--- | :--- |
| **`beep`** | **AnimeApps / PlayEng CDN** (`playeng.animeapps.top`) | Direct HD `.m3u8` master (`/r2/cachehd/.../index.m3u8`) | Embedded or Direct VTT | Pre-cached ultra-low latency streams; highest availability for mainstream titles. |
| **`yuki`** | **MegaPlay / NexaBloom / VidCloud** (`megaplay.buzz`) | Dynamic tokenized `.m3u8` master (`megap.shiora.top`) | Multi-language WebVTT (English, Spanish, Portuguese, French, etc.) | High-bitrate master playlists with full global subtitle coverage. |
| **`neko`** | **BibiEmbed / Cloudflare Edge Workers** (`*.vibevibe.workers.dev`) | Worker-routed HLS stream | In-stream | Proxied through Cloudflare serverless edge nodes to bypass geo-restrictions. |
| **`zuna`** | **AniWatch / ZokoAnime / HiAnime** (`hls2.aniwatchtv.uk`) | Direct AniWatch CDN master (`/v/.../master.m3u8`) | English & Multi-Language VTT | Direct CDN connection to AniWatch/HiAnime infrastructure with high reliability. |
| **`loli`** | **EchoVideo / AnimeWave** (`play2.echovideo.ru`) | EchoVideo CDN HLS master (`hlsx3cdn.echovideo.to`) | In-stream | Russian & European high-bandwidth mirror CDN with signed session query tokens. |

---

## 4. Anime Metadata & Episode Indexing

Anime identification is unified via **AniList ID** and **MyAnimeList (MAL) ID**.

### 1. AniList GraphQL Search (`https://graphql.anilist.co`)
Allows fuzzy searching by English, Romaji, and native Japanese titles:
```graphql
query ($search: String) {
  Page(page: 1, perPage: 15) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      idMal
      title { romaji english native }
      episodes
      bannerImage
      coverImage { large extraLarge }
      description
      genres
      seasonYear
      status
      averageScore
    }
  }
}
```

### 2. Paginated Episode Chunks (`/api/anime/:id/episodes`)
For long-running series (e.g. *One Piece* with 1100+ episodes), episode metadata is fetched in 100-episode chunks:
```http
GET https://api.bingr.one/api/anime/21/episodes?chunk=0
```
Each episode entry includes:
- `episode`: Episode index number (1, 2, 3...)
- `title`: Translated episode title
- `still`: Episode thumbnail image URL
- `air_date`: Original broadcast date
- `overview`: Plot summary

---

## 5. Fallback Architecture: AnimeSalt Multi-Audio Engine

If the primary `Ryuu` resolver yields 0 sources for an obscure or unindexed episode, the scraper automatically falls back to **AnimeSalt**:
```http
GET https://hianime.filmu.in/animesalt/streams?title=:encodedTitle&ep=:ep&season=1
Headers:
  x-api-key: <token>
```
* **Provider**: Scrapes **Mikazuki** and multi-audio archives.
* **Output**: Returns fallback HLS streams and direct MP4 mirrors with embedded language tags.

---

## 6. AniSkip Automated Skip Intro & Outro Architecture

Anime series consistently contain Opening (`OP`) and Ending (`ED`) theme songs. The scraper integrates directly with **AniSkip** (`https://api.aniskip.com`), an open timestamp database keyed by **MyAnimeList (MAL) ID**.

### API Query:
```http
GET https://api.aniskip.com/v2/skip-times/:idMal/:episode?types[]=op&types[]=ed&episodeLength=0
```

### Example Live Response (One Piece Ep 1000, MAL ID: 21):
```json
{
  "found": true,
  "results": [
    {
      "interval": {
        "startTime": 13.891,
        "endTime": 123.834
      },
      "skipType": "op",
      "skipId": "5bcf9262-b16f-40ad-9d12-8168e4ecad2d",
      "episodeLength": 1430.721
    }
  ],
  "statusCode": 200
}
```

### Timestamp Normalization:
The scraper normalizes intervals into structured objects:
```javascript
{
  start: 13.891,
  end: 123.834,
  startFormatted: "00:13",
  endFormatted: "02:03",
  type: "op",
  label: "Skip Intro"
}
```

---

## 7. Subtitle Extraction & WebVTT Handling

Servers `yuki` and `zuna` return multi-language WebVTT subtitle tracks.

### WebVTT Data Model:
```json
{
  "lang": "en",
  "label": "English",
  "url": "https://fetch.nexabloom.top/anime/.../subtitles/english.vtt",
  "proxyUrl": "https://hianime.filmu.in/proxy/subtitle?url=...&referer=https%3A%2F%2Fmegaplay.buzz%2F"
}
```
* **CORS Proxying**: Subtitles hosted on protected origins are automatically routed via the pre-built `proxyUrl` to prevent browser CORS security rejections.
* **Video Tag Injection**: Subtitles should always be injected into HTML5 video elements with `crossorigin="anonymous"`.

---

## 8. Player Integration & Dynamic Skip Event Lifecycle

During HTML5 video playback, a listener checks the video element's `currentTime` on every `timeupdate` tick:

```javascript
video.addEventListener('timeupdate', () => {
  const cur = video.currentTime;

  // Check if current time falls within any AniSkip interval
  const active = skipIntervals.find(i => cur >= i.start && cur <= i.end && !dismissed.has(i.start));

  if (active) {
    skipBtn.innerText = `⏩ ${active.label} (${active.startFormatted} ➔ ${active.endFormatted})`;
    skipBtn.onclick = () => {
      dismissed.add(active.start);
      video.currentTime = active.end; // Jump straight past the OP/ED
      skipBtn.classList.add('hidden');
    };
    skipBtn.classList.remove('hidden');
  } else {
    skipBtn.classList.add('hidden');
  }
});
```

---

## 9. REST Microservice API Specification

The microservice (`server.js`) exposes dedicated anime endpoints:

### 1. `GET /api/anime/search?q={query}`
Searches anime across AniList and returns titles, cover posters, MAL IDs, episode counts, and ratings.

### 2. `GET /api/anime/:id`
Returns complete anime metadata, backdrop, synopsis, and `idMal`.

### 3. `GET /api/anime/:id/episodes?chunk={chunk}`
Returns paginated episodes (chunk 0 = episodes 1–100, chunk 1 = 101–200, etc.).

### 4. `GET /api/anime/:id/:episode/streams?type=sub|dub&race=1`
Extracts direct `.m3u8` links from all 5 servers (`beep`, `yuki`, `neko`, `zuna`, `loli`).
* Query parameter `race=1` runs an immediate latency probe and returns the fastest live server.

### 5. `GET /api/anime/skip/:idMal/:episode`
Fetches OP and ED skip timestamps from the AniSkip database.

### 6. `GET /test` or `GET /ui`
Serves the interactive HTML5 test bench and live video player dashboard.

---

## 10. Command-Line Interface (`anime_cli.js`)

A standalone CLI tool is provided for terminal testing and script automation:

```bash
# 1. Basic search and stream resolution
node anime_cli.js "One Piece" 1000

# 2. Extract Dubbed audio with server latency race
node anime_cli.js "Demon Slayer" 1 --type dub --race

# 3. Lookup directly by AniList ID
node anime_cli.js 21 1000

# 4. Pure JSON output for piping into jq / external scripts
node anime_cli.js "Jujutsu Kaisen" 1 --json
```

---

## 11. Speed Race & Latency Optimization

Because anime video CDNs vary in regional peering, the engine provides an automated **Speed Race** routine (`speedRaceAnimeServers`):
1. Dispatches concurrent HTTP `HEAD` / lightweight `GET` probes across all 5 servers.
2. Verifies the presence of the `#EXTM3U` header.
3. Ranks servers by response latency in milliseconds.
4. Player automatically binds to the lowest-latency live server.

---

## 12. Agentic Guidelines & Operational Maintenance Rules

When extending or automating this anime scraper engine:

1. **Strict Anime Scope**: Do not conflate this engine with general movie/TV TMDB scrapers. Keep anime resolution isolated to AniList, MyAnimeList, and the 5 anime servers.
2. **Always Pair AniList with MAL**: AniSkip requires the MyAnimeList ID (`idMal`). When fetching AniList metadata, always store and propagate `idMal`.
3. **Session Token Expiration**: The Ryuu JWT token expires every 2.5 hours. Always use `getAnimeToken()` which auto-refreshes expired tokens.
4. **Header Integrity**: When playing direct streams outside the built-in proxy, preserve `Referer` headers (`https://playeng.animeapps.top/` for `beep`, `https://megaplay.buzz/` for `yuki`, `https://bibiemb.xyz` for `neko`, `https://zokoanime.video/` for `zuna`).
5. **Multi-Server Fallback**: Never assume a single server is permanently active. Always render the 5-server switcher in player interfaces.
