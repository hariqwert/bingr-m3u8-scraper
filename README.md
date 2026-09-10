# 🎬 Bingr M3U8 HLS Stream Scraper

A high-speed, reverse-engineered scraper and microservice for extracting live **M3U8 HLS video streams** for any **Movie** or **TV Series (by Season & Episode)** using standard TMDB IDs.

---

## ⚡ Highlights

- **Zero API Keys Required**: Automatically extracts streams without paid keys.
- **Movies & TV Shows**: Supports single movies and multi-season TV episodes.
- **Auto Subtitle Catching**: Automatically extracts multi-language **WebVTT (`.vtt`) subtitles** across 85+ languages.
- **Multi-Audio & Dub Switching**: Supports both HLS v7 master playlist audio tracks and multi-language server streams (English, Hindi, Spanish, Russian, etc.).
- **Live Sports Matches**: Scrapes live matches and sports HLS video streams (Willow Cricket, Fox Sports, etc.).
- **Multi-Server Auto-Cascade**: Automatically tries `s62` (Bastion), `s40` (DarkMatter), `s70` (Polaris), `s3` (Edmunds).
- **Multiple Interfaces**:
  - Modular Node.js Library (`scraper.js`)
  - Command Line Tool (`cli.js`)
  - Standalone REST API Microservice (`server.js`)
- **Zero External Dependencies**: Runs out of the box using Node.js standard libraries.

---

## 🚀 Quickstart

### 1. Command Line (CLI)
```bash
# Search for Movies & TV Shows
node cli.js search "Kill"

# Scrape Movie M3U8 & Subtitles (TMDB ID: 1108427)
node cli.js movie 1108427

# List Episodes in a TV Season (Breaking Bad S1)
node cli.js episodes 1396 1

# Scrape Specific TV Episode (with 85+ subtitle tracks)
node cli.js tv 1396 1 1

# Catch Subtitles Directly
node cli.js subtitles tv 1396 1 1

# Live Sports
node cli.js sports
node cli.js sport-stream solaris 247-fox-footy
```

### 2. Programmatic Usage (Node.js)
```javascript
const scraper = require('./scraper');

// Scrape Movie (includes M3U8, subtitles array, and multi-language sources)
const movie = await scraper.scrapeMovie(1108427);
console.log('Stream URL:', movie.primaryM3u8);
console.log('Subtitles:', movie.subtitles);

// Scrape TV Series Episode
const episode = await scraper.scrapeTvEpisode(1396, 1, 1);
console.log('Episode Stream:', episode.primaryM3u8);
console.log('Subtitles Count:', episode.subtitles.length);

// Direct Subtitle Extraction
const subs = await scraper.getSubtitles('tv', 1396, 1, 1);
console.log('Available Subtitles:', subs.map(s => s.label));
```

### 3. REST API Microservice
```bash
node server.js
# API running on http://localhost:5000
```
- `GET /search?q=Kill`
- `GET /movie/1108427/stream`
- `GET /tv/1396/season/1`
- `GET /tv/1396/season/1/episode/1/stream`
- `GET /subtitles/tv/1396?season=1&ep=1`
- `GET /sports/matches`
- `GET /sports/stream/solaris/247-willow`

---

## 🔄 Already Integrated the Old Scraper? (Upgrade Guide)

If your existing application previously integrated our scraper without dub audio or subtitle support, follow our complete upgrade guide in **[AGENTS.md (Section 10)](AGENTS.md#10-migration--upgrade-guide-for-existing-integrations)**:

1. **Add `crossorigin="anonymous"`** to your `<video>` tag so the browser permits cross-origin WebVTT captions.
2. **Inject WebVTT `<track>` elements** directly from the returned `result.subtitles` array.
3. **Toggle Subtitles** dynamically using `video.textTracks[i].mode = 'showing' | 'disabled'`.
4. **Enable Dual-Layer Audio Switching** to support both internal HLS v7 tracks and multi-source regional streams.

👉 **[Read the Full Upgrade & Drop-in Player Code in AGENTS.md](AGENTS.md#10-migration--upgrade-guide-for-existing-integrations)**

---

## 📖 Complete Technical Architecture & Specification

Read **[AGENTS.md](AGENTS.md)** for full documentation on:
- Network reverse-engineering and anti-bot bypass
- Request/response schemas for movies, seasons, and episodes
- Subtitle catching & WebVTT proxy infrastructure
- Dual-layer multi-audio and language switching architecture
- Live sports match scraping and direct HLS extraction
- CDN segment masking (.jpg format delivering MPEG-TS packets)
- Server cluster directory and fallback cascade algorithms
- Python and cURL implementations

---

## 📄 License
MIT
