# ⚡ Anime M3U8 HLS Stream Scraper Engine

A high-speed, zero-dependency scraper, microservice, and interactive player bench exclusively for extracting live **Anime M3U8 HLS video streams** across **5 specialized server clusters** (`beep`, `yuki`, `neko`, `zuna`, `loli`) with automated **AniSkip Skip Intro / Outro** integration.

---

## 🌟 Features

- **5 Anime Server Clusters**:
  - `beep`: AnimeApps / PlayEng CDN (cached direct `.m3u8`)
  - `yuki`: MegaPlay / NexaBloom Master (tokenized master with global WebVTT)
  - `neko`: BibiEmbed / Cloudflare Edge Workers
  - `zuna`: AniWatch / ZokoAnime / HiAnime CDN
  - `loli`: EchoVideo / AnimeWave mirror CDN
- **Automated AniSkip OP/ED Skipping**: Fetches millisecond-accurate opening (`op`) and ending (`ed`) interval timestamps via `api.aniskip.com`.
- **Anime Metadata & Chunked Episodes**: Seamless AniList GraphQL integration and 100-episode chunk pagination.
- **Speed Race Latency Engine**: Races all 5 servers concurrently to identify and play the fastest operational CDN.
- **Interactive Web Player & Test Bench**: Complete dark-theme web dashboard hosted on `http://localhost:5000/test` with Hls.js playback and floating Skip Intro button.
- **Zero External Dependencies**: Pure Node.js standard libraries (`http`, `https`, `url`, `fs`).

---

## 🚀 Quickstart

### 1. Command Line Interface (CLI)
```bash
# 1. Search and extract streams from all 5 servers
node anime_cli.js "One Piece" 1000

# 2. Race latency and extract Dubbed streams
node anime_cli.js "Demon Slayer" 1 --type dub --race

# 3. Lookup directly by AniList ID
node anime_cli.js 21 1000

# 4. Pure JSON output
node anime_cli.js "Jujutsu Kaisen" 1 --json
```

---

### 2. Interactive Web Player & Test Bench
Start the microservice:
```bash
node server.js
```
Open your browser at:
👉 **`http://localhost:5000/test`** (or `http://localhost:5000/`)

* Search any anime title (*One Piece*, *Demon Slayer*, *Attack on Titan*, *Jujutsu Kaisen*).
* Switch between `beep`, `yuki`, `neko`, `zuna`, and `loli` servers in real time.
* Watch the floating **"Skip Intro"** / **"Skip Ending"** pill button appear dynamically during opening and ending themes!

---

### 3. REST API Endpoints

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/anime/search?q={query}` | Fuzzy title search with MAL/AniList mapping |
| `GET` | `/api/anime/:id` | Anime metadata details, synopsis, and MAL ID |
| `GET` | `/api/anime/:id/episodes?chunk={chunk}` | Paginated episodes list (100 per chunk) |
| `GET` | `/api/anime/:id/:episode/streams?type=sub\|dub&race=1` | Direct `.m3u8` links from all 5 servers |
| `GET` | `/api/anime/skip/:idMal/:episode` | AniSkip OP/ED skip intervals |
| `GET` | `/api/anime/servers` | Active anime cluster server directory |
| `GET` | `/test` | Interactive Web Player & API Test Bench |

---

### 4. Programmatic Node.js Usage
```javascript
const {
  searchAnime,
  getAnimeDetails,
  getAnimeStreams,
  getSkipTimes,
  speedRaceAnimeServers
} = require('./animeScraper');

// 1. Search
const results = await searchAnime('One Piece');
const top = results[0];

// 2. Extract streams from beep, yuki, neko, zuna, loli + AniSkip
const streamData = await getAnimeStreams({
  anilistId: top.id,
  episode: 1000,
  type: 'sub',
  idMal: top.idMal
});

console.log('Active Servers:', streamData.servers);
console.log('Skip Timestamps:', streamData.skipTimes);

// 3. Race latency across live servers
const race = await speedRaceAnimeServers(streamData.sources);
console.log('Fastest CDN:', race.fastest.server, `${race.fastest.latency}ms`);
```

---

## 📖 Architecture & Protocols

For full protocol details, token schemas, server origins, and player event lifecycles, see **[`AGENTS.md`](./AGENTS.md)**.
