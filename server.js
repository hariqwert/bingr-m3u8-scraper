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

function renderPlayerHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bingr M3U8 Stream Scraper — Local Engine</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0b0c10; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; padding: 20px; }
    .container { max-width: 1050px; margin: 0 auto; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #1f2937; padding-bottom: 15px; }
    h1 { font-size: 20px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
    .badge { background: #4f46e5; color: #fff; font-size: 11px; padding: 4px 9px; border-radius: 999px; text-transform: uppercase; font-weight: 600; }
    .controls-panel { background: #13161f; border: 1px solid #232838; border-radius: 12px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; align-items: end; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 12px; font-weight: 600; color: #9ca3af; }
    input, select { background: #1b1f2d; border: 1px solid #2e354a; color: #fff; padding: 9px 12px; border-radius: 8px; font-size: 13px; outline: none; }
    input:focus, select:focus { border-color: #6366f1; }
    button.btn-primary { background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; font-weight: 700; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; transition: 0.2s; height: 38px; }
    button.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .video-wrap { position: relative; width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 14px; overflow: hidden; border: 1px solid #232838; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
    video { width: 100%; height: 100%; background: #000; }
    .btn-skip { display: none; position: absolute; bottom: 65px; right: 20px; z-index: 40; background: rgba(99, 102, 241, 0.92); color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.6); backdrop-filter: blur(8px); transition: transform 0.15s ease; }
    .btn-skip:hover { transform: scale(1.05); background: rgba(79, 70, 229, 0.98); }
    .btn-next { display: none; position: absolute; bottom: 65px; right: 20px; z-index: 40; background: rgba(16, 185, 129, 0.92); color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.6); backdrop-filter: blur(8px); }
    .btn-next:hover { transform: scale(1.05); background: rgba(5, 150, 105, 0.98); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; background: #13161f; border: 1px solid #232838; border-radius: 10px; padding: 12px; align-items: center; justify-content: space-between; }
    .tool-group { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .status-log { font-size: 12px; color: #9ca3af; margin-top: 10px; padding: 8px 12px; background: #11141c; border-radius: 6px; font-family: monospace; border: 1px solid #1e2230; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Bingr M3U8 Scraper <span class="badge">Engine v2.0</span></h1>
      <span style="font-size:12px; color:#6b7280;">4K UHD • Multi-Audio • Subtitles • Skip Intro</span>
    </header>

    <div class="controls-panel">
      <div class="field">
        <label>Media Type</label>
        <select id="typeSelect" onchange="toggleType()">
          <option value="movie">Movie</option>
          <option value="tv">TV Series</option>
        </select>
      </div>

      <div class="field">
        <label>TMDB ID</label>
        <input type="number" id="tmdbInput" value="1108427" placeholder="e.g. 1108427">
      </div>

      <div class="field tv-field" style="display:none;">
        <label>Season</label>
        <input type="number" id="seasonInput" value="1" min="1">
      </div>

      <div class="field tv-field" style="display:none;">
        <label>Episode</label>
        <input type="number" id="episodeInput" value="1" min="1">
      </div>

      <div class="field" style="grid-column: span 2;">
        <label>Server Cluster Priority</label>
        <select id="srvSelect">
          <option value="s4k">Priority #1: s4k PeakStorm (4K UHD & 1080p Direct)</option>
          <option value="s70">Priority #2: s70 Polaris (Multi-Language Dubs / HLS v7)</option>
          <option value="s40">Priority #3: s40 DarkMatter (StreamRip 1080p)</option>
          <option value="s62">Priority #4: s62 Bastion (KNOCW/NXOCW 720p)</option>
          <option value="s3">Priority #5: s3 Edmunds (Filmu Proxy)</option>
          <option value="s60">Priority #6: s60 Vertex (Alternate)</option>
          <option value="s61">Priority #7: s61 Corvus</option>
          <option value="s30">Priority #8: s30 Nova</option>
          <option value="s31">Priority #9: s31 Orion</option>
        </select>
      </div>

      <button class="btn-primary" onclick="startStream()">▶ Load Stream</button>
    </div>

    <div class="video-wrap">
      <video id="videoPlayer" controls playsinline crossorigin="anonymous"></video>
      <button id="skipIntroBtn" class="btn-skip" onclick="skipIntro()">⏭️ Skip Intro</button>
      <button id="nextEpBtn" class="btn-next" onclick="nextEpisode()">⏭️ Next Episode</button>
    </div>

    <div class="toolbar">
      <div class="tool-group">
        <select id="audioSelect" onchange="switchAudio(this.value)">
          <option value="-1">Audio: Default</option>
        </select>

        <select id="subSelect" onchange="switchSubtitle(this.value)">
          <option value="off">Subtitles: Off</option>
        </select>

        <select id="qualitySelect" onchange="switchQuality(this.value)">
          <option value="-1">Quality: Auto (4K)</option>
        </select>
      </div>

      <div id="badgeCluster" style="font-size:12px; color:#10b981; font-weight:600;">Ready</div>
    </div>

    <div id="statusLog" class="statusLog">Ready. Select a server and click Load Stream.</div>
  </div>

  <script>
    let hls = null;
    let currentSources = [];
    let currentSubtitles = [];
    let hasSkippedIntro = false;
    let introStart = 15;
    let introEnd = 95;

    const SERVERS = ['s4k', 's70', 's40', 's62', 's3', 's60', 's61', 's30', 's31'];
    let currentServerIndex = 0;

    function toggleType() {
      const type = document.getElementById('typeSelect').value;
      const tvFields = document.querySelectorAll('.tv-field');
      tvFields.forEach(f => f.style.display = type === 'tv' ? 'flex' : 'none');
      if (type === 'tv' && document.getElementById('tmdbInput').value === '1108427') {
        document.getElementById('tmdbInput').value = '1396'; // Breaking Bad
      } else if (type === 'movie' && document.getElementById('tmdbInput').value === '1396') {
        document.getElementById('tmdbInput').value = '1108427'; // Kill (2024)
      }
    }

    async function startStream() {
      const type = document.getElementById('typeSelect').value;
      const id = document.getElementById('tmdbInput').value.trim();
      const season = document.getElementById('seasonInput').value.trim();
      const ep = document.getElementById('episodeInput').value.trim();
      const srv = document.getElementById('srvSelect').value;

      currentServerIndex = SERVERS.indexOf(srv);
      if (currentServerIndex === -1) currentServerIndex = 0;

      const log = document.getElementById('statusLog');
      log.innerText = \`[1/3] Querying stream on \${srv.toUpperCase()}...\`;

      // Fetch skip timestamps in parallel
      fetch(\`/skip/\${id}/\${type === 'tv' ? ep : 1}\`)
        .then(r => r.json())
        .then(data => {
          if (data && data.op) {
            introStart = data.op.start;
            introEnd = data.op.end;
            hasSkippedIntro = false;
            console.log(\`[Skip Intro] Window: \${introStart}s - \${introEnd}s\`);
          }
        }).catch(() => {});

      try {
        const streamUrl = type === 'movie' 
          ? \`/movie/\${id}/stream?srv=\${srv}\` 
          : \`/tv/\${id}/season/\${season}/episode/\${ep}/stream?srv=\${srv}\`;

        const res = await fetch(streamUrl);
        const data = await res.json();

        if (!data || !data.success || !data.primaryM3u8) {
          throw new Error(data?.error || 'No stream returned from server');
        }

        log.innerText = \`[2/3] Stream resolved via \${srv.toUpperCase()}. Loading \${data.quality || 'Auto'}...\`;
        attachStream(data.sources || [{ url: data.primaryM3u8 }], data.subtitles || []);
        document.getElementById('badgeCluster').innerText = \`Cluster: \${srv.toUpperCase()} (\${data.quality || 'Ready'})\`;
      } catch (err) {
        log.innerText = \`[FAILOVER] \${srv.toUpperCase()} failed: \${err.message}. Stepping to next server...\`;
        stepNextServer();
      }
    }

    function attachStream(sources, subtitles) {
      const video = document.getElementById('videoPlayer');
      currentSources = sources;
      currentSubtitles = subtitles;

      // Subtitles
      video.querySelectorAll('track').forEach(t => t.remove());
      const subSelect = document.getElementById('subSelect');
      subSelect.innerHTML = '<option value="off">Subtitles: Off</option>';

      if (subtitles && subtitles.length > 0) {
        subtitles.forEach((s, idx) => {
          const tr = document.createElement('track');
          tr.kind = 'subtitles';
          tr.label = s.label || s.lang;
          tr.srclang = s.lang || 'en';
          tr.src = s.url;
          video.appendChild(tr);

          const opt = document.createElement('option');
          opt.value = idx;
          opt.innerText = \`CC: \${s.label || s.lang}\`;
          subSelect.appendChild(opt);
        });
      }

      // Audio Select
      const audioSelect = document.getElementById('audioSelect');
      audioSelect.innerHTML = '<option value="-1">Audio: Default</option>';
      const langSources = sources.filter(s => s.language || (s.label && s.label.includes('—')));
      if (langSources.length > 1) {
        langSources.forEach((s, idx) => {
          const opt = document.createElement('option');
          opt.value = \`src_\${idx}\`;
          opt.innerText = \`Audio: \${s.label || s.language}\`;
          audioSelect.appendChild(opt);
        });
      }

      // Hls.js
      if (hls) hls.destroy();
      const primaryUrl = sources[0].url;

      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(primaryUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (e, d) => {
          const qSelect = document.getElementById('qualitySelect');
          if (d.levels && d.levels.length > 1) {
            qSelect.innerHTML = '<option value="-1">Quality: Auto (4K)</option>';
            d.levels.forEach((l, idx) => {
              const opt = document.createElement('option');
              opt.value = idx;
              opt.innerText = \`\${l.height}p (\${Math.round(l.bitrate / 1000)} kbps)\`;
              qSelect.appendChild(opt);
            });
          }
          video.play().catch(() => {});
          document.getElementById('statusLog').innerText = '[3/3] Playback started successfully!';
        });

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (e, d) => {
          if (d.audioTracks && d.audioTracks.length > 1) {
            audioSelect.innerHTML = '';
            d.audioTracks.forEach((t, idx) => {
              const opt = document.createElement('option');
              opt.value = \`hls_\${idx}\`;
              opt.innerText = \`Audio: \${t.name || t.lang || 'Track ' + (idx + 1)}\`;
              audioSelect.appendChild(opt);
            });
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.warn('[CASCADE] Fatal error encountered:', data.details);
            stepNextServer();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = primaryUrl;
      }
    }

    function stepNextServer() {
      currentServerIndex = (currentServerIndex + 1) % SERVERS.length;
      const nextSrv = SERVERS[currentServerIndex];
      document.getElementById('srvSelect').value = nextSrv;
      document.getElementById('statusLog').innerText = \`[CASCADE] Auto-failing over to \${nextSrv.toUpperCase()}...\`;
      startStream();
    }

    // Skip Intro & Outro Monitor
    const video = document.getElementById('videoPlayer');
    const skipBtn = document.getElementById('skipIntroBtn');
    const nextBtn = document.getElementById('nextEpBtn');

    video.addEventListener('timeupdate', () => {
      const cur = video.currentTime;
      if (!hasSkippedIntro && cur >= introStart && cur <= introEnd) {
        skipBtn.style.display = 'block';
      } else {
        skipBtn.style.display = 'none';
      }

      if (video.duration && (video.duration - cur <= 120)) {
        nextBtn.style.display = 'block';
      } else {
        nextBtn.style.display = 'none';
      }
    });

    function skipIntro() {
      hasSkippedIntro = true;
      video.currentTime = introEnd;
      skipBtn.style.display = 'none';
    }

    function nextEpisode() {
      const epInput = document.getElementById('episodeInput');
      epInput.value = parseInt(epInput.value || '1') + 1;
      startStream();
    }

    function switchSubtitle(idx) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = (idx !== 'off' && i === parseInt(idx)) ? 'showing' : 'disabled';
      }
    }

    function switchAudio(val) {
      if (val.startsWith('hls_')) {
        if (hls) hls.audioTrack = parseInt(val.replace('hls_', ''));
      } else if (val.startsWith('src_')) {
        const idx = parseInt(val.replace('src_', ''));
        if (currentSources[idx] && hls) {
          hls.loadSource(currentSources[idx].url);
          hls.attachMedia(video);
        }
      }
    }

    function switchQuality(val) {
      if (hls) hls.currentLevel = parseInt(val);
    }
  </script>
</body>
</html>`;
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
    // 0. Web Player UI: /player or /play or root browser visit
    if (pathname === '/player' || pathname === '/play' || (pathname === '/' && req.headers.accept && req.headers.accept.includes('text/html'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderPlayerHtml());
    }

    // 1. Root / Health (JSON API)
    if (pathname === '/' || pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        name: 'Bingr M3U8 Stream Scraper API',
        player: 'http://localhost:' + PORT + '/player',
        endpoints: [
          'GET  /search?q={query_or_tmdb_id}',
          'GET  /movie/:tmdbId',
          'GET  /movie/:tmdbId/stream?srv={optional_server}',
          'GET  /tv/:tmdbId',
          'GET  /tv/:tmdbId/season/:seasonNumber',
          'GET  /tv/:tmdbId/season/:seasonNumber/episode/:episodeNumber/stream?srv={optional_server}',
          'GET  /subtitles/:type/:tmdbId?season=1&ep=1',
          'GET  /skip/:id/:episode',
          'GET  /sports/matches',
          'GET  /sports/stream/:source/:matchId',
          'GET  /servers',
          'POST /scrape'
        ]
      });
    }

    // 1a. Subtitles API: /subtitles/:type/:id
    const subMatch = pathname.match(/^\/subtitles\/([a-zA-Z0-9_-]+)\/(\d+)$/);
    if (subMatch) {
      const type = subMatch[1];
      const tmdbId = subMatch[2];
      const season = parsedUrl.query.season || 1;
      const episode = parsedUrl.query.ep || parsedUrl.query.episode || 1;
      const subs = await scraper.getSubtitles(type, tmdbId, season, episode);
      return sendJson(res, 200, { tmdbId: Number(tmdbId), type, subtitles: subs });
    }

    // 1b. Skip Intro & Outro Timestamps API: /skip/:id or /skip/:id/:episode
    const skipMatch = pathname.match(/^\/skip\/(\d+)(?:\/(\d+))?$/);
    if (skipMatch) {
      const id = skipMatch[1];
      const episode = skipMatch[2] || parsedUrl.query.ep || 1;
      const skipTimes = await scraper.getSkipTimes(id, episode);
      return sendJson(res, 200, { id: Number(id), episode: Number(episode), ...skipTimes });
    }

    // 1b. Sports Matches List
    if (pathname === '/sports/matches') {
      const data = await scraper.getLiveSportsMatches();
      return sendJson(res, 200, data);
    }

    // 1c. Sports Match Stream
    const sportStreamMatch = pathname.match(/^\/sports\/stream\/([^\/]+)\/(.+)$/);
    if (sportStreamMatch) {
      const source = decodeURIComponent(sportStreamMatch[1]);
      const matchId = decodeURIComponent(sportStreamMatch[2]);
      const streamData = await scraper.getMatchStream(source, matchId);
      return sendJson(res, 200, streamData);
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
