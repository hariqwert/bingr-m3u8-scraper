const http = require('http');
const url = require('url');
const scraper = require('./scraper');

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
    // 1. Root / Health
    if (pathname === '/' || pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        name: 'Bingr M3U8 Stream Scraper API',
        endpoints: [
          'GET  /search?q={query_or_tmdb_id}',
          'GET  /movie/:tmdbId',
          'GET  /movie/:tmdbId/stream?srv={optional_server}',
          'GET  /tv/:tmdbId',
          'GET  /tv/:tmdbId/season/:seasonNumber',
          'GET  /tv/:tmdbId/season/:seasonNumber/episode/:episodeNumber/stream?srv={optional_server}',
          'GET  /servers',
          'POST /scrape'
        ]
      });
    }

    // 2. Active Servers List
    if (pathname === '/servers') {
      return sendJson(res, 200, { servers: scraper.SERVERS });
    }

    // 3. Search Movies & Shows
    if (pathname === '/search') {
      const q = parsedUrl.query.q;
      if (!q) return sendJson(res, 400, { error: 'Query parameter q is required' });
      const results = await scraper.search(q);
      return sendJson(res, 200, results);
    }

    // 4. Movie Stream Scrape: /movie/:id/stream
    const movieStreamMatch = pathname.match(/^\/movie\/(\d+)\/stream$/);
    if (movieStreamMatch) {
      const tmdbId = movieStreamMatch[1];
      const srv = parsedUrl.query.srv;
      const result = await scraper.scrapeMovie(tmdbId, { srv });
      return sendJson(res, result.success ? 200 : 404, result);
    }

    // 5. Movie Metadata: /movie/:id
    const movieMatch = pathname.match(/^\/movie\/(\d+)$/);
    if (movieMatch) {
      const tmdbId = movieMatch[1];
      const details = await scraper.getMovieDetails(tmdbId);
      return sendJson(res, 200, details);
    }

    // 6. TV Episode Stream Scrape: /tv/:id/season/:season/episode/:episode/stream
    const tvStreamMatch = pathname.match(/^\/tv\/(\d+)\/season\/(\d+)\/episode\/(\d+)\/stream$/);
    if (tvStreamMatch) {
      const tmdbId = tvStreamMatch[1];
      const season = tvStreamMatch[2];
      const episode = tvStreamMatch[3];
      const srv = parsedUrl.query.srv;
      const result = await scraper.scrapeTvEpisode(tmdbId, season, episode, { srv });
      return sendJson(res, result.success ? 200 : 404, result);
    }

    // 7. TV Season Episodes List: /tv/:id/season/:season
    const tvSeasonMatch = pathname.match(/^\/tv\/(\d+)\/season\/(\d+)$/);
    if (tvSeasonMatch) {
      const tmdbId = tvSeasonMatch[1];
      const season = tvSeasonMatch[2];
      const episodes = await scraper.getTvEpisodes(tmdbId, season);
      return sendJson(res, 200, { tmdbId: Number(tmdbId), season: Number(season), episodes });
    }

    // 8. TV Show Metadata: /tv/:id
    const tvMatch = pathname.match(/^\/tv\/(\d+)$/);
    if (tvMatch) {
      const tmdbId = tvMatch[1];
      const details = await scraper.getTvDetails(tmdbId);
      return sendJson(res, 200, details);
    }

    // 9. Universal POST /scrape
    if (req.method === 'POST' && pathname === '/scrape') {
      const body = await parseBody(req);
      const result = await scraper.scrapeStream(body);
      return sendJson(res, result.success ? 200 : 404, result);
    }

    return sendJson(res, 404, { error: 'Route not found' });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Bingr M3U8 Scraper Microservice running on http://localhost:${PORT}`);
});
