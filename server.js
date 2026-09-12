const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const animeScraper = require('./animeScraper');

const PORT = process.env.PORT || 5000;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  try {
    // 1. Serve Interactive Test Bench UI
    if (pathname === '/test' || pathname === '/ui' || pathname === '/demo' || (pathname === '/' && (req.headers['accept'] || '').includes('text/html'))) {
      const htmlPath = path.join(__dirname, 'test_anime.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(fs.readFileSync(htmlPath, 'utf8'));
      }
    }

    // 2. Health & Service Overview
    if (pathname === '/' || pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'Anime M3U8 Stream Scraper API',
        clusters: ['beep', 'yuki', 'neko', 'zuna', 'loli'],
        endpoints: [
          'GET  /api/anime/search?q={query}',
          'GET  /api/anime/:id',
          'GET  /api/anime/:id/episodes?chunk={chunk}',
          'GET  /api/anime/:id/:episode/streams?type=sub|dub&race=1',
          'GET  /api/anime/skip/:idMal/:episode',
          'GET  /api/anime/servers',
          'GET  /test  (Interactive Web Player & Test Bench)'
        ]
      });
    }

    // 3. Anime Servers List
    if (pathname === '/api/anime/servers' || pathname === '/servers') {
      return sendJson(res, 200, {
        servers: [
          { id: 'beep', name: 'Beep', provider: 'AnimeApps CDN' },
          { id: 'yuki', name: 'Yuki', provider: 'MegaPlay / NexaBloom' },
          { id: 'neko', name: 'Neko', provider: 'BibiEmbed / Cloudflare Edge' },
          { id: 'zuna', name: 'Zuna', provider: 'AniWatch / ZokoAnime' },
          { id: 'loli', name: 'Loli', provider: 'EchoVideo CDN' }
        ]
      });
    }

    // 4. Anime Search: /api/anime/search?q={query}
    if (pathname === '/api/anime/search' || pathname === '/search') {
      const q = parsedUrl.query.q;
      if (!q) return sendJson(res, 400, { error: 'Query parameter q is required' });
      const results = await animeScraper.searchAnime(q);
      return sendJson(res, 200, { count: results.length, results });
    }

    // 5. Anime Metadata Details: /api/anime/:id
    const animeDetailsMatch = pathname.match(/^\/api\/anime\/(\d+)$/);
    if (animeDetailsMatch) {
      const id = animeDetailsMatch[1];
      const details = await animeScraper.getAnimeDetails(id);
      return sendJson(res, 200, details);
    }

    // 6. Anime Episodes List: /api/anime/:id/episodes?chunk=0
    const animeEpMatch = pathname.match(/^\/api\/anime\/(\d+)\/episodes$/);
    if (animeEpMatch) {
      const id = animeEpMatch[1];
      const chunk = parsedUrl.query.chunk || 0;
      const data = await animeScraper.getAnimeEpisodes(id, chunk);
      return sendJson(res, 200, data);
    }

    // 7. Anime Stream Scrape across 5 Servers: /api/anime/:id/:episode/streams
    const animeStreamMatch = pathname.match(/^\/api\/anime\/(\d+)\/(\d+)\/streams$/);
    if (animeStreamMatch) {
      const anilistId = animeStreamMatch[1];
      const episode = animeStreamMatch[2];
      const type = parsedUrl.query.type || 'sub';
      const title = parsedUrl.query.title || '';
      const idMal = parsedUrl.query.idMal || null;
      const shouldRace = parsedUrl.query.race === '1' || parsedUrl.query.race === 'true';

      const streamData = await animeScraper.getAnimeStreams({
        anilistId,
        episode: Number(episode),
        type,
        title,
        idMal
      });

      if (shouldRace && streamData.sources.length) {
        const race = await animeScraper.speedRaceAnimeServers(streamData.sources);
        return sendJson(res, 200, { ...streamData, speedRace: race });
      }

      return sendJson(res, 200, streamData);
    }

    // 8. AniSkip Skip Intro / Outro Times: /api/anime/skip/:idMal/:episode
    const animeSkipMatch = pathname.match(/^\/api\/anime\/skip\/(\d+)\/(\d+)$/);
    if (animeSkipMatch) {
      const idMal = animeSkipMatch[1];
      const episode = animeSkipMatch[2];
      const skipData = await animeScraper.getSkipTimes(idMal, episode);
      return sendJson(res, 200, { idMal: Number(idMal), episode: Number(episode), ...skipData });
    }

    return sendJson(res, 404, { error: 'Route not found' });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Anime M3U8 Stream Scraper Microservice running on http://localhost:${PORT}`);
  console.log(`📺 Web Player & API Test Bench: http://localhost:${PORT}/test`);
});
