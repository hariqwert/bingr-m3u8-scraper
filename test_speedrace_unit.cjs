const https = require('https');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: options.method || (postData ? 'POST' : 'GET'),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.vidking.net/',
        'Origin': 'https://www.vidking.net',
        ...(postData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        } : {})
      },
      timeout: 10000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch (e) { resolve({ status: res.statusCode, data: d, raw: true }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

async function scrapeSpeedrace({ type = 'movie', id, title = '', year = '', season, episode }) {
  const seedRes = await request(`https://api.speedracelight.com/seed?mediaId=${id}`);
  const seed = seedRes.data?.seed;
  if (!seed) throw new Error('Failed to retrieve seed token from SpeedRace');

  const encTitle = encodeURIComponent(encodeURIComponent(title));
  let url = `https://api.speedracelight.com/cdn/sources-with-title?title=${encTitle}&mediaType=${type}&year=${year}&tmdbId=${id}&imdbId=tt${String(id).padStart(7, '0')}&enc=2&seed=${seed}`;
  if (type === 'tv' && season && episode) {
    url += `&season=${season}&episode=${episode}`;
  }

  const encRes = await request(url);
  const encText = encRes.data;
  if (!encText || typeof encText !== 'string') {
    throw new Error('Empty or invalid encrypted payload from SpeedRace gateway');
  }

  const decRes = await request('https://enc-dec.app/api/dec-videasy', {
    body: { text: encText, id: String(id), seed }
  });

  const resData = decRes.data?.result;
  if (!resData) throw new Error('Decryption failed for SpeedRace stream');

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
    subtitles: resData.subtitles || []
  };
}

async function getDirectSubtitles(type, id, season, episode) {
  let url = `https://sub.vdrk.site/v1/${type}/${id}`;
  if (type === 'tv') {
    url += `/${season || 1}/${episode || 1}`;
  }
  const res = await request(url);
  if (res.status === 200 && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

async function runTests() {
  console.log('=== Test 1: Speedrace Movie (Kill, TMDB 1108427) ===');
  const movieRes = await scrapeSpeedrace({ type: 'movie', id: 1108427, title: 'Kill', year: '2024' });
  console.log('Success! Sources found:', movieRes.sources.length);
  console.log('Master 4K Playlist:', movieRes.playlist);
  console.log('Sample Source:', movieRes.sources[0]);

  console.log('\n=== Test 2: Speedrace TV (Breaking Bad S01E01, TMDB 1396) ===');
  const tvRes = await scrapeSpeedrace({ type: 'tv', id: 1396, title: 'Breaking Bad', year: '2008', season: 1, episode: 1 });
  console.log('Success! Sources found:', tvRes.sources.length);
  console.log('Master 4K Playlist:', tvRes.playlist);

  console.log('\n=== Test 3: Direct VDRK Subtitles (Breaking Bad S01E01) ===');
  const subs = await getDirectSubtitles('tv', 1396, 1, 1);
  console.log('Success! Direct subtitles found:', subs.length);
  if (subs.length > 0) {
    console.log('Sample subtitle:', subs[0]);
  }
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
