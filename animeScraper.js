const https = require('https');
const http = require('http');
const { URL } = require('url');

const BINGR_API = 'https://api.bingr.one/api';
const RYUU_API = 'https://hianime.filmu.in';
const ANISKIP_API = 'https://api.aniskip.com/v2';
const ANILIST_GRAPHQL = 'https://graphql.anilist.co';

// Token cache for Ryuu / AnimeSalt
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Perform an HTTPS/HTTP request with custom headers
 */
function doRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const client = isHttps ? https : http;
    const postData = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...(options.referer ? { 'Referer': options.referer } : {}),
      ...(options.origin ? { 'Origin': options.origin } : {}),
      ...(options.headers || {})
    };

    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    const req = client.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers,
      timeout: options.timeout || 15000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body, raw: true });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout requesting ${urlStr}`));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * 1. Acquire or reuse short-lived JWT token from hianime.filmu.in
 */
async function getAnimeToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  try {
    const res = await doRequest(`${RYUU_API}/token`, { method: 'POST' });
    if (res.status === 200 && res.data && res.data.token) {
      cachedToken = res.data.token;
      tokenExpiry = Date.now() + (2 * 60 * 60 * 1000); // 2 hours
      return cachedToken;
    }
    throw new Error(`Failed to get token: HTTP ${res.status}`);
  } catch (e) {
    console.error(`[AnimeScraper] Token error:`, e.message);
    throw e;
  }
}

/**
 * 2. Search Anime using AniList GraphQL (with fallback to Bingr)
 */
async function searchAnime(query) {
  if (!query) throw new Error('Search query is required');

  const gqlQuery = JSON.stringify({
    query: `query ($search: String) {
      Page(page: 1, perPage: 15) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          title { romaji english native }
          episodes
          bannerImage
          coverImage { large medium extraLarge }
          description
          genres
          seasonYear
          status
          averageScore
        }
      }
    }`,
    variables: { search: query }
  });

  try {
    const res = await doRequest(ANILIST_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: gqlQuery,
      timeout: 8000
    });

    if (res.data?.data?.Page?.media) {
      const qLower = query.toLowerCase().trim();
      const mapped = res.data.data.Page.media.map(m => ({
        id: m.id,
        idMal: m.idMal,
        title: m.title.english || m.title.romaji,
        romajiTitle: m.title.romaji,
        englishTitle: m.title.english,
        nativeTitle: m.title.native,
        episodes: m.episodes,
        year: m.seasonYear,
        poster: m.coverImage?.large || m.coverImage?.extraLarge,
        banner: m.bannerImage,
        description: m.description,
        genres: m.genres || [],
        rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
        status: m.status
      }));

      // Prioritize exact or substring matches
      mapped.sort((a, b) => {
        const aEng = (a.englishTitle || a.title || '').toLowerCase();
        const bEng = (b.englishTitle || b.title || '').toLowerCase();
        const aMatch = aEng.includes(qLower) ? 1 : 0;
        const bMatch = bEng.includes(qLower) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      });

      return mapped;
    }
  } catch (e) {
    console.warn('[AnimeScraper] AniList GraphQL failed, using Bingr API:', e.message);
  }

  // Fallback to Bingr search
  const bingrRes = await doRequest(`${BINGR_API}/search?q=${encodeURIComponent(query)}`, {
    headers: {
      'Referer': 'https://bingr.one/',
      'Origin': 'https://bingr.one'
    }
  });

  return (bingrRes.data?.results || []).filter(r => r.type === 'anime');
}

/**
 * 3. Get Anime Metadata Details (includes MAL ID and episode count)
 */
async function getAnimeDetails(id) {
  if (!id) throw new Error('Anime ID is required');

  const res = await doRequest(`${BINGR_API}/anime/${id}`, {
    headers: {
      'Referer': 'https://bingr.one/',
      'Origin': 'https://bingr.one'
    }
  });

  if (res.status === 200 && res.data && res.data.id) {
    return res.data;
  }
  throw new Error(`Anime details not found for ID: ${id}`);
}

/**
 * 4. Get Anime Episode List for a Chunk
 */
async function getAnimeEpisodes(id, chunk = 0) {
  if (!id) throw new Error('Anime ID is required');

  const res = await doRequest(`${BINGR_API}/anime/${id}/episodes?chunk=${chunk}`, {
    headers: {
      'Referer': 'https://bingr.one/',
      'Origin': 'https://bingr.one'
    }
  });

  if (res.status === 200 && res.data) {
    return res.data;
  }
  return { total: 0, episodes: [] };
}

/**
 * 5. Get AniSkip Skip Intervals (OP/ED skip times)
 * @param {number|string} idMal - MyAnimeList Anime ID
 * @param {number|string} episode - Episode number
 */
async function getSkipTimes(idMal, episode) {
  if (!idMal || !episode) return { found: false, intervals: [] };

  const url = `${ANISKIP_API}/skip-times/${idMal}/${episode}?types[]=op&types[]=ed&episodeLength=0`;
  try {
    const res = await doRequest(url, { timeout: 6000 });
    if (res.status === 200 && res.data?.found && res.data?.results) {
      const intervals = res.data.results.map(r => ({
        start: r.interval.startTime,
        end: r.interval.endTime,
        startFormatted: formatSeconds(r.interval.startTime),
        endFormatted: formatSeconds(r.interval.endTime),
        type: r.skipType, // 'op' or 'ed'
        label: r.skipType === 'op' ? 'Skip Intro' : 'Skip Ending',
        skipId: r.skipId
      }));
      return { found: true, intervals };
    }
  } catch (e) {
    console.warn(`[AnimeScraper] AniSkip unavailable for MAL ${idMal} ep ${episode}:`, e.message);
  }
  return { found: false, intervals: [] };
}

/**
 * Helper to format seconds as MM:SS
 */
function formatSeconds(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 6. Extract All 5 Anime Server Streams (beep, yuki, neko, zuna, loli)
 * @param {Object} params
 * @param {number|string} params.anilistId - AniList ID
 * @param {number|string} params.episode - Episode number
 * @param {string} [params.type='sub'] - 'sub' or 'dub'
 * @param {string} [params.title] - Anime title (used for fallback search)
 * @param {number|string} [params.idMal] - Optional MAL ID for skip intro lookup
 */
async function getAnimeStreams({ anilistId, episode = 1, type = 'sub', title = '', idMal = null }) {
  if (!anilistId) throw new Error('AniList ID is required to fetch anime streams');

  const token = await getAnimeToken();

  // Primary: Ryuu endpoint
  const ryuuUrl = `${RYUU_API}/ryuu/streams?anilistId=${anilistId}&ep=${episode}&type=${type}`;
  let streams = [];

  try {
    const res = await doRequest(ryuuUrl, {
      headers: { 'x-api-key': token },
      timeout: 18000
    });

    if (res.status === 200 && Array.isArray(res.data?.streams) && res.data.streams.length > 0) {
      streams = res.data.streams;
    }
  } catch (e) {
    console.warn(`[AnimeScraper] Ryuu fetch failed:`, e.message);
  }

  // Fallback: AnimeSalt if Ryuu had no sources
  if (!streams.length && title) {
    try {
      console.log(`[AnimeScraper] Ryuu returned 0 streams, attempting AnimeSalt for "${title}"...`);
      const saltUrl = `${RYUU_API}/animesalt/streams?title=${encodeURIComponent(title)}&ep=${episode}&season=1`;
      const saltRes = await doRequest(saltUrl, {
        headers: { 'x-api-key': token },
        timeout: 18000
      });

      if (saltRes.status === 200 && Array.isArray(saltRes.data?.streams) && saltRes.data.streams.length > 0) {
        streams = saltRes.data.streams;
      }
    } catch (e) {
      console.warn(`[AnimeScraper] AnimeSalt fallback failed:`, e.message);
    }
  }

  // Normalize streams across the 5 servers
  const normalizedSources = streams.map(s => {
    const rawUrl = s.url || s.proxyUrl;
    const referer = s.referer || (s.headers && s.headers.Referer) || '';
    const proxyUrl = s.proxyUrl || `${RYUU_API}/proxy/m3u8?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(referer)}`;

    const subtitles = (s.subtitles || []).map(sub => ({
      lang: sub.lang || sub.label || 'en',
      label: sub.label || 'Subtitles',
      url: sub.url?.startsWith('/') ? `${RYUU_API}${sub.url}` : sub.url,
      proxyUrl: `${RYUU_API}/proxy/subtitle?url=${encodeURIComponent(sub.url)}&referer=${encodeURIComponent(referer)}`
    }));

    return {
      server: s.server || 'unknown',
      name: `Server ${s.server?.toUpperCase()}`,
      url: rawUrl,
      proxyUrl: proxyUrl,
      type: s.type || 'm3u8',
      dubType: s.dubType || type.toUpperCase(),
      quality: s.quality || 'auto',
      referer: referer,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(referer ? { 'Referer': referer } : {})
      },
      subtitles: subtitles
    };
  });

  // Get skip intervals if MAL ID is provided
  let skipTimes = { found: false, intervals: [] };
  if (idMal) {
    skipTimes = await getSkipTimes(idMal, episode);
  }

  return {
    anilistId,
    episode,
    type,
    serverCount: normalizedSources.length,
    servers: normalizedSources.map(s => s.server),
    skipTimes,
    sources: normalizedSources
  };
}

/**
 * 7. Probe Stream Liveness & Latency
 */
async function probeStream(streamUrl, referer = '', timeout = 4000) {
  const start = Date.now();
  try {
    const u = new URL(streamUrl);
    const client = u.protocol === 'https:' ? https : http;

    return await new Promise((resolve) => {
      const req = client.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...(referer ? { 'Referer': referer } : {})
        },
        timeout
      }, (res) => {
        const latency = Date.now() - start;
        let chunk = '';
        res.on('data', c => {
          chunk += c;
          if (chunk.length > 512) req.destroy();
        });
        res.on('end', () => {
          const isHls = chunk.includes('#EXTM3U') || (res.headers['content-type'] || '').includes('mpegurl');
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, latency, isHls });
        });
        res.on('close', () => {
          const isHls = chunk.includes('#EXTM3U') || (res.headers['content-type'] || '').includes('mpegurl');
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, latency, isHls });
        });
      });

      req.on('error', (err) => resolve({ ok: false, error: err.message, latency: Date.now() - start }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout', latency: Date.now() - start });
      });
      req.end();
    });
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start };
  }
}

/**
 * 8. Race all 5 server scrapers to find the fastest live one
 */
async function speedRaceAnimeServers(sources) {
  if (!sources || !sources.length) return null;

  const results = await Promise.all(sources.map(async (src) => {
    const probe = await probeStream(src.url, src.referer);
    return {
      server: src.server,
      source: src,
      ...probe
    };
  }));

  const live = results.filter(r => r.ok).sort((a, b) => a.latency - b.latency);
  return {
    fastest: live[0] || null,
    rankings: results
  };
}

module.exports = {
  searchAnime,
  getAnimeDetails,
  getAnimeEpisodes,
  getAnimeStreams,
  getSkipTimes,
  probeStream,
  speedRaceAnimeServers,
  getAnimeToken
};
