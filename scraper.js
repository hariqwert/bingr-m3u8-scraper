const https = require('https');

const BINGR_API = 'https://api.bingr.one/api';

/**
 * Active Bingr Scraper Clusters
 */
const SERVERS = [
  { id: 's4k', name: 'PeakStorm 4K (SpeedRace 4K UHD & 1080p)', cc: 'GL' },
  { id: 's70', name: 'Polaris (Multi-Language Dubs / HLS v7)', cc: 'US' },
  { id: 's40', name: 'DarkMatter (StreamRip 1080p)', cc: 'GL' },
  { id: 's62', name: 'Bastion (KNOCW / NXOCW / FLOCW CDN)', cc: 'IN' },
  { id: 's3',  name: 'Edmunds (Filmu Proxy)', cc: 'US' },
  { id: 's60', name: 'Vertex', cc: 'US' },
  { id: 's61', name: 'Corvus', cc: 'US' },
  { id: 's30', name: 'Nova', cc: 'US' },
  { id: 's31', name: 'Orion', cc: 'US' }
];

/**
 * HTTP Client with Bingr Origin / Referer bypass headers
 */
function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = pathname.startsWith('http') ? pathname : `${BINGR_API}${pathname}`;
    const u = new URL(fullUrl);
    const postData = options.body ? JSON.stringify(options.body) : null;

    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': options.referer || 'https://bingr.one/',
        'Origin': 'https://bingr.one',
        ...(postData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        } : {})
      },
      timeout: options.timeout || 12000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, raw: true });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out to ${u.pathname}`));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Search TMDB Movies & TV Shows
 * @param {string} query - Movie name, TV title, or raw TMDB ID
 */
async function search(query) {
  if (!query) throw new Error('Query string is required');
  
  // If query is an exact numeric TMDB ID, resolve directly
  if (/^\d+$/.test(query.trim())) {
    const tmdbId = query.trim();
    try {
      const movie = await getMovieDetails(tmdbId);
      if (movie && movie.id) return { results: [movie], isDirectTmdb: true };
    } catch (e) {}
    try {
      const tv = await getTvDetails(tmdbId);
      if (tv && tv.id) return { results: [tv], isDirectTmdb: true };
    } catch (e) {}
  }

  const res = await request(`/search?q=${encodeURIComponent(query)}`);
  return res.data;
}

/**
 * Get Movie Metadata by TMDB ID
 * @param {number|string} tmdbId 
 */
async function getMovieDetails(tmdbId) {
  const res = await request(`/details/movie/${tmdbId}`);
  if (res.status !== 200) throw new Error(`Movie not found for TMDB ID: ${tmdbId}`);
  return res.data;
}

/**
 * Get TV Series Metadata by TMDB ID (includes seasons count)
 * @param {number|string} tmdbId 
 */
async function getTvDetails(tmdbId) {
  const res = await request(`/details/tv/${tmdbId}`);
  if (res.status !== 200) throw new Error(`TV Show not found for TMDB ID: ${tmdbId}`);
  return res.data;
}

/**
 * Get list of episodes for a specific TV Season
 * @param {number|string} tmdbId 
 * @param {number|string} seasonNumber 
 */
async function getTvEpisodes(tmdbId, seasonNumber) {
  const res = await request(`/episodes/${tmdbId}/${seasonNumber}`);
  if (res.status !== 200) throw new Error(`Episodes not found for TMDB ID ${tmdbId} Season ${seasonNumber}`);
  return res.data?.episodes || [];
}

/**
 * Catch Subtitles for Movie or TV Episode (Direct VDRK with Bingr Proxy Fallback)
 * @param {string} type - 'movie' or 'tv'
 * @param {number|string} tmdbId - TMDB ID
 * @param {number|string} [season] - TV season number (defaults to 1)
 * @param {number|string} [episode] - TV episode number (defaults to 1)
 */
async function getSubtitles(type, tmdbId, season, episode) {
  // 1. Primary: Direct query to sub.vdrk.site (Open CORS, 80+ languages)
  try {
    let directUrl = `https://sub.vdrk.site/v1/${type}/${tmdbId}`;
    if (type === 'tv') {
      directUrl += `/${season || 1}/${episode || 1}`;
    }
    const directRes = await request(directUrl, { referer: 'https://bingr.one/' });
    if (directRes.status === 200 && Array.isArray(directRes.data) && directRes.data.length > 0) {
      return directRes.data.map((s, idx) => ({
        id: `vdrk-direct-${tmdbId}-${idx}`,
        url: s.file || s.url,
        lang: s.lang || (s.label ? s.label.slice(0, 2).toLowerCase() : 'en'),
        label: s.label || s.lang || 'English',
        source: 'vdrk-direct'
      }));
    }
  } catch (e) {}

  // 2. Secondary: Fallback to Bingr API subtitle proxy
  let endpoint = `/subtitles/vdrk/${type}/${tmdbId}`;
  if (type === 'tv') {
    endpoint += `?season=${season || 1}&ep=${episode || 1}`;
  }
  try {
    const res = await request(endpoint, {
      referer: type === 'tv'
        ? `https://bingr.one/watch/tv/${tmdbId}/${season || 1}/${episode || 1}`
        : `https://bingr.one/watch/movie/${tmdbId}`
    });
    if (res.status === 200 && Array.isArray(res.data?.subtitles)) {
      return res.data.subtitles;
    }
  } catch (err) {}
  return [];
}

/**
 * Scrape Direct 4K & 1080p M3U8 from SpeedRace / PeakStorm CDN Engine
 * @param {Object} params
 */
async function scrapeSpeedrace({ type = 'movie', id, title = '', year = '', season, episode }) {
  if (!id) throw new Error('TMDB ID is required');

  // 1. Fetch seed token
  const seedRes = await request(`https://api.speedracelight.com/seed?mediaId=${id}`, {
    referer: 'https://www.vidking.net/'
  });
  const seed = seedRes.data?.seed;
  if (!seed) throw new Error('Failed to retrieve seed token from SpeedRace');

  // 2. Query gateway (CDN sources)
  const encTitle = encodeURIComponent(encodeURIComponent(title || ''));
  let url = `https://api.speedracelight.com/cdn/sources-with-title?title=${encTitle}&mediaType=${type}&year=${year || ''}&tmdbId=${id}&imdbId=tt${String(id).padStart(7, '0')}&enc=2&seed=${seed}`;
  if (type === 'tv' && season && episode) {
    url += `&season=${season}&episode=${episode}`;
  }

  const encRes = await request(url, { referer: 'https://www.vidking.net/' });
  const encText = encRes.data;
  if (!encText || typeof encText !== 'string') {
    throw new Error('Empty encrypted response from SpeedRace');
  }

  // 3. Decrypt via enc-dec.app gateway
  const decRes = await request('https://enc-dec.app/api/dec-videasy', {
    method: 'POST',
    body: { text: encText, id: String(id), seed },
    referer: 'https://www.vidking.net/'
  });

  const resData = decRes.data?.result;
  if (!resData) throw new Error('Failed to decrypt SpeedRace payload');

  const sources = [];
  if (resData.playlist) {
    sources.push({
      url: resData.playlist,
      quality: '4K / Auto',
      type: 'application/x-mpegurl',
      label: 'PeakStorm #0 (Master 4K UHD)',
      name: 'Master 4K'
    });
  }

  if (Array.isArray(resData.sources)) {
    for (let i = 0; i < resData.sources.length; i++) {
      const s = resData.sources[i];
      sources.push({
        url: s.url,
        quality: s.quality || 'Auto',
        type: 'application/x-mpegurl',
        label: `PeakStorm #${i + 1} (${s.quality})`,
        name: s.quality
      });
    }
  }

  return {
    scraperName: 'PeakStorm 4K',
    playlist: resData.playlist,
    sources,
    subtitles: Array.isArray(resData.subtitles) ? resData.subtitles : []
  };
}

/**
 * Universal Stream Scraper with Server Cascade
 * @param {Object} params
 * @param {string} params.type - 'movie' or 'tv'
 * @param {number|string} params.id - TMDB ID
 * @param {string} [params.title] - Media Title
 * @param {string|number} [params.year] - Release Year
 * @param {number} [params.season] - TV Season number
 * @param {number} [params.episode] - TV Episode number
 * @param {string} [params.srv] - Specific server ID (e.g. 's4k', 's62', 's40') or omit for auto-cascade
 */
async function scrapeStream({ type = 'movie', id, title, year, season, episode, srv }) {
  if (!id) throw new Error('TMDB ID is required');

  // If title or year are missing, resolve them automatically
  let mediaTitle = title;
  let mediaYear = year;

  if (!mediaTitle) {
    try {
      const details = type === 'tv' ? await getTvDetails(id) : await getMovieDetails(id);
      mediaTitle = details.title || details.name;
      mediaYear = details.year || (details.first_air_date ? details.first_air_date.slice(0, 4) : undefined);
    } catch (e) {}
  }

  const query = {
    title: mediaTitle || '',
    year: mediaYear ? String(mediaYear) : undefined
  };

  if (type === 'tv' && season && episode) {
    query.season = Number(season);
    query.episode = Number(episode);
  }

  const serversToTry = srv ? [srv] : SERVERS.map(s => s.id);
  const attempts = [];
  let successResult = null;

  for (const serverId of serversToTry) {
    const serverMeta = SERVERS.find(s => s.id === serverId) || { name: serverId };
    const startTime = Date.now();

    try {
      let sources = [];
      let scraperName = serverMeta.name;
      let rawSubtitles = [];

      if (serverId === 's4k') {
        // Direct scrape from PeakStorm / SpeedRace 4K engine
        const speedRes = await scrapeSpeedrace({
          type,
          id: Number(id),
          title: mediaTitle,
          year: mediaYear,
          season,
          episode
        });
        sources = speedRes.sources || [];
        scraperName = speedRes.scraperName || serverMeta.name;
        rawSubtitles = speedRes.subtitles || [];
      } else {
        // Bingr scraper cluster
        const payload = {
          srv: serverId,
          t: type,
          id: Number(id),
          query
        };

        const referer = type === 'tv'
          ? `https://bingr.one/watch/tv/${id}/${season || 1}/${episode || 1}`
          : `https://bingr.one/watch/movie/${id}`;

        const res = await request('/stream', {
          method: 'POST',
          body: payload,
          referer
        });

        if (res.status === 200 && res.data?.sources?.length > 0) {
          sources = res.data.sources;
          scraperName = res.data.scraperName || serverMeta.name;
          rawSubtitles = res.data.subtitles || [];
        }
      }

      const latencyMs = Date.now() - startTime;

      if (sources.length > 0) {
        let subtitles = rawSubtitles;
        try {
          const externalSubs = await getSubtitles(type, id, season, episode);
          if (Array.isArray(externalSubs) && externalSubs.length > 0) {
            const seenUrls = new Set(subtitles.map(s => s.url));
            for (const sub of externalSubs) {
              if (!seenUrls.has(sub.url)) {
                subtitles.push(sub);
                seenUrls.add(sub.url);
              }
            }
          }
        } catch (e) {}

        successResult = {
          success: true,
          type,
          tmdbId: Number(id),
          title: mediaTitle,
          year: mediaYear,
          ...(type === 'tv' ? { season: Number(season), episode: Number(episode) } : {}),
          serverId,
          serverName: serverMeta.name,
          scraperName,
          primaryM3u8: sources[0].url,
          quality: sources[0].quality || 'Auto',
          sources,
          subtitles
        };

        attempts.push({
          serverId,
          serverName: serverMeta.name,
          status: 'success',
          latencyMs,
          sourcesCount: sources.length
        });
        break;
      } else {
        attempts.push({
          serverId,
          serverName: serverMeta.name,
          status: 'empty_sources',
          latencyMs
        });
      }
    } catch (err) {
      attempts.push({
        serverId,
        serverName: serverMeta.name,
        status: 'error',
        latencyMs: Date.now() - startTime,
        error: err.message
      });
    }
  }

  if (successResult) {
    return { ...successResult, attempts };
  }

  return {
    success: false,
    type,
    tmdbId: Number(id),
    title: mediaTitle,
    error: 'No working stream found across active scraper clusters',
    attempts,
    fallbackEmbeds: [
      `https://embed.filmu.in/${type}/${id}${type === 'tv' ? `/${season}/${episode}` : ''}`,
      `https://player.videasy.net/${type}/${id}${type === 'tv' ? `/${season}/${episode}` : ''}`,
      `https://vidbolt.xyz/${type}/${id}${type === 'tv' ? `/${season}/${episode}` : ''}`,
      `https://embed.bingr.one/embed/${type}/${id}${type === 'tv' ? `/${season}/${episode}` : ''}`
    ]
  };
}

/**
 * Helper to Scrape Movie Stream
 */
function scrapeMovie(tmdbId, options = {}) {
  return scrapeStream({ type: 'movie', id: tmdbId, ...options });
}

/**
 * Helper to Scrape TV Episode Stream
 */
function scrapeTvEpisode(tmdbId, season, episode, options = {}) {
  return scrapeStream({ type: 'tv', id: tmdbId, season, episode, ...options });
}

/**
 * Fetch All Live & Upcoming Sports Matches Today
 */
async function getLiveSportsMatches() {
  const [allToday, popular] = await Promise.all([
    request('/sports/matches/all-today', { referer: 'https://bingr.one/sports' }),
    request('/sports/matches/popular', { referer: 'https://bingr.one/sports' })
  ]);

  return {
    today: Array.isArray(allToday.data) ? allToday.data : [],
    popular: Array.isArray(popular.data) ? popular.data : []
  };
}

/**
 * Scrape Live Stream / M3U8 for a Sports Match
 * @param {string} source - e.g. 'solaris'
 * @param {string} matchId - e.g. '247-fox-footy'
 */
async function getMatchStream(source, matchId) {
  if (!source || !matchId) throw new Error('Both source and matchId are required');
  const pathname = `/sports/stream/${encodeURIComponent(source)}/${encodeURIComponent(matchId)}`;
  const res = await request(pathname, { referer: 'https://bingr.one/sports' });
  const streams = Array.isArray(res.data) ? res.data : [];

  // Extract direct M3U8 URLs if available
  const formatted = streams.map(s => {
    let directM3u8 = null;
    if (s.embedUrl && s.embedUrl.includes('.m3u8')) {
      directM3u8 = s.embedUrl;
    }
    return {
      id: s.id,
      streamNo: s.streamNo,
      language: s.language || 'Default',
      hd: !!s.hd,
      name: s.source || `Stream ${s.streamNo}`,
      url: directM3u8 || s.embedUrl,
      isM3u8: !!directM3u8,
      embedUrl: s.embedUrl
    };
  });

  return {
    matchId,
    source,
    streams: formatted,
    primaryStream: formatted.find(f => f.isM3u8) || formatted[0] || null
  };
}

/**
 * Retrieve Opening / Ending Skip Timestamps (AniSkip API with Standard TV Heuristics)
 * @param {number|string} malIdOrTmdbId - MyAnimeList or TMDB identifier
 * @param {number} [episode=1] - Episode number
 */
async function getSkipTimes(malIdOrTmdbId, episode = 1) {
  if (!malIdOrTmdbId) {
    return { found: false, op: { start: 15, end: 95 }, ed: null };
  }
  try {
    const url = `https://api.aniskip.com/v2/skip-times/${malIdOrTmdbId}/${episode}?types[]=op&types[]=ed&episodeLength=0`;
    const res = await request(url);
    if (res.status === 200 && res.data?.found && Array.isArray(res.data?.results)) {
      const op = res.data.results.find(r => r.skipType === 'op');
      const ed = res.data.results.find(r => r.skipType === 'ed');
      return {
        found: true,
        op: op ? { start: Math.round(op.interval.startTime), end: Math.round(op.interval.endTime) } : { start: 15, end: 95 },
        ed: ed ? { start: Math.round(ed.interval.startTime), end: Math.round(ed.interval.endTime) } : null,
        results: res.data.results
      };
    }
  } catch (e) {}
  return {
    found: false,
    op: { start: 15, end: 95 }, // Standard 80s TV intro heuristic fallback
    ed: null
  };
}

module.exports = {
  SERVERS,
  search,
  getMovieDetails,
  getTvDetails,
  getTvEpisodes,
  getSubtitles,
  getSkipTimes,
  scrapeSpeedrace,
  scrapeStream,
  scrapeMovie,
  scrapeTvEpisode,
  getLiveSportsMatches,
  getMatchStream
};

