# 🎬 Bingr M3U8 HLS Stream Scraper

A high-speed, reverse-engineered scraper and microservice for extracting live **M3U8 HLS video streams** for any **Movie** or **TV Series (by Season & Episode)** using standard TMDB IDs.

---

## ⚡ Highlights

- **Zero API Keys Required**: Automatically extracts streams without paid keys.
- **Movies & TV Shows**: Supports single movies and multi-season TV episodes.
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

# Scrape Movie M3U8 (TMDB ID: 1108427)
node cli.js movie 1108427

# List Episodes in a TV Season (Breaking Bad S1)
node cli.js episodes 1396 1

# Scrape Specific TV Episode (Breaking Bad Season 1 Episode 1)
node cli.js tv 1396 1 1
```

### 2. Programmatic Usage (Node.js)
```javascript
const scraper = require('./scraper');

// Scrape Movie
const movie = await scraper.scrapeMovie(1108427);
console.log('Movie Stream:', movie.primaryM3u8);

// Scrape TV Series Episode
const episode = await scraper.scrapeTvEpisode(1396, 1, 1);
console.log('Episode Stream:', episode.primaryM3u8);
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

---

## 📖 Complete Technical Architecture & Specification

Read **[AGENTS.md](AGENTS.md)** for full documentation on:
- Network reverse-engineering and anti-bot bypass
- Request/response schemas for movies, seasons, and episodes
- CDN segment masking (.jpg format delivering MPEG-TS packets)
- Server cluster directory and fallback cascade algorithms
- Python and cURL implementations

---

## 📄 License
MIT
