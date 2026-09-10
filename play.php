<?php
/**
 * Standalone Zero-Dependency PHP Video Player with Scraper Server Selection,
 * Multi-Language Dub Audio, and WebVTT Subtitle Catching.
 *
 * Usage:
 *   play.php?tmdb=1108427                        (Movie)
 *   play.php?tmdb=1108427&srv=s70                (Movie on Polaris server)
 *   play.php?tmdb=1396&type=tv&season=1&ep=1     (TV Episode)
 */

$tmdbId  = isset($_GET['tmdb']) ? preg_replace('/[^0-9]/', '', $_GET['tmdb']) : '1108427';
$type    = isset($_GET['type']) && $_GET['type'] === 'tv' ? 'tv' : 'movie';
$season  = isset($_GET['season']) ? (int)$_GET['season'] : 1;
$episode = isset($_GET['ep']) ? (int)$_GET['ep'] : (isset($_GET['episode']) ? (int)$_GET['episode'] : 1);
$currentSrv = isset($_GET['srv']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['srv']) : 's62';

// Active Server Clusters
$servers = [
    's62' => 'Bastion (Default - KNOCW/NXOCW)',
    's70' => 'Polaris (Multi-Language Dubs / HLS v7)',
    's40' => 'DarkMatter (StreamRip 1080p)',
    's3'  => 'Edmunds (Filmu Proxy)',
    's60' => 'Vertex (Alternate)',
    's61' => 'Corvus',
    's30' => 'Nova',
    's31' => 'Orion'
];

/**
 * Perform cURL request to Bingr API with required bypass headers
 */
function queryBingr($endpoint, $postData = null) {
    $ch = curl_init('https://api.bingr.one/api' . $endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin: https://bingr.one',
        'Referer: https://bingr.one/'
    ]);

    if ($postData !== null) {
        $json = json_encode($postData);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin: https://bingr.one',
            'Referer: https://bingr.one/',
            'Content-Type: application/json',
            'Content-Length: ' . strlen($json)
        ]);
    }

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($status === 200 && $res) ? json_decode($res, true) : null;
}

// 1. Scrape stream from selected server
$streamPayload = [
    'srv' => $currentSrv,
    't'   => $type,
    'id'  => (int)$tmdbId,
    'query' => [
        'title' => '',
        'year'  => ''
    ]
];
if ($type === 'tv') {
    $streamPayload['query']['season'] = $season;
    $streamPayload['query']['episode'] = $episode;
}

$streamResult = queryBingr('/stream', $streamPayload);
$sources = (isset($streamResult['sources']) && is_array($streamResult['sources'])) ? $streamResult['sources'] : [];

// If selected server failed, try automatic cascade across available servers
$usedSrv = $currentSrv;
if (empty($sources)) {
    foreach (array_keys($servers) as $altSrv) {
        if ($altSrv === $currentSrv) continue;
        $streamPayload['srv'] = $altSrv;
        $altRes = queryBingr('/stream', $streamPayload);
        if (!empty($altRes['sources'])) {
            $streamResult = $altRes;
            $sources = $altRes['sources'];
            $usedSrv = $altSrv;
            break;
        }
    }
}

// 2. Catch multi-language subtitles
$subPath = "/subtitles/vdrk/{$type}/{$tmdbId}";
if ($type === 'tv') {
    $subPath .= "?season={$season}&ep={$episode}";
}
$subResult = queryBingr($subPath);
$subtitles = (isset($subResult['subtitles']) && is_array($subResult['subtitles'])) ? $subResult['subtitles'] : [];
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Play: TMDB <?= htmlspecialchars($tmdbId) ?> (<?= htmlspecialchars($servers[$usedSrv] ?? $usedSrv) ?>)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>
  <style>
    body { background: #0b0d19; color: #e2e8f0; font-family: system-ui, sans-serif; }
    .glass { background: rgba(18, 22, 43, 0.85); backdrop-filter: blur(12px); }
  </style>
</head>
<body class="p-4 sm:p-6 min-h-screen flex flex-col items-center justify-center">

  <div class="w-full max-w-4xl flex flex-col gap-3">

    <!-- Header & Scraper / Server Selector -->
    <div class="glass border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
      <div>
        <h1 class="text-sm font-bold text-white flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full <?= !empty($sources) ? 'bg-emerald-400 animate-pulse' : 'bg-red-400' ?>"></span>
          TMDB: <?= htmlspecialchars($tmdbId) ?> <?= $type === 'tv' ? "(S{$season}E{$episode})" : '' ?>
        </h1>
        <p class="text-xs text-slate-400">Current Scraper: <span class="text-purple-400 font-semibold"><?= htmlspecialchars($servers[$usedSrv] ?? $usedSrv) ?></span></p>
      </div>

      <!-- MANDATORY SCRAPER / SERVER SELECTION DROPDOWN -->
      <form method="GET" class="flex items-center gap-2 text-xs">
        <input type="hidden" name="tmdb" value="<?= htmlspecialchars($tmdbId) ?>">
        <input type="hidden" name="type" value="<?= htmlspecialchars($type) ?>">
        <?php if ($type === 'tv'): ?>
          <input type="hidden" name="season" value="<?= htmlspecialchars($season) ?>">
          <input type="hidden" name="ep" value="<?= htmlspecialchars($episode) ?>">
        <?php endif; ?>

        <label for="srv" class="font-medium text-slate-300">Scraper Server:</label>
        <select name="srv" id="srv" onchange="this.form.submit()" class="bg-slate-900 border border-purple-500/50 text-purple-200 font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:border-purple-400">
          <?php foreach ($servers as $srvKey => $srvTitle): ?>
            <option value="<?= $srvKey ?>" <?= $srvKey === $usedSrv ? 'selected' : '' ?>>
              [<?= $srvKey ?>] <?= htmlspecialchars($srvTitle) ?>
            </option>
          <?php endforeach; ?>
        </select>
        <noscript><button type="submit" class="px-2 py-1 bg-purple-600 rounded">Switch</button></noscript>
      </form>
    </div>

    <!-- Video Container -->
    <div class="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      <?php if (!empty($sources)): ?>
        <video
          id="videoPlayer"
          controls
          playsinline
          crossorigin="anonymous"
          class="w-full h-full object-contain"
        ></video>
      <?php else: ?>
        <div class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <p class="text-red-400 font-semibold mb-2">No active stream found on server <?= htmlspecialchars($currentSrv) ?>.</p>
          <p class="text-xs text-slate-400">Try selecting another scraper cluster from the dropdown above.</p>
        </div>
      <?php endif; ?>
    </div>

    <!-- Player Controls: Audio Dubs, Subtitles, Quality -->
    <div class="glass border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-2">
        <span class="text-slate-400">Stream Status:</span>
        <span class="px-2 py-0.5 rounded-full text-[11px] <?= !empty($sources) ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800' ?>">
          <?= !empty($sources) ? 'Ready ('.count($sources).' source'.(count($sources)>1?'s':'').')' : 'Offline' ?>
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Audio / Dub Language Selector -->
        <select id="audioSelect" onchange="switchAudio(this.value)" class="bg-slate-900 border border-slate-700 text-purple-300 rounded-lg px-2.5 py-1 outline-none cursor-pointer">
          <option value="-1">Audio: Default</option>
        </select>

        <!-- Subtitles Track Selector -->
        <select id="subtitleSelect" onchange="switchSubtitle(this.value)" class="bg-slate-900 border border-slate-700 text-amber-300 rounded-lg px-2.5 py-1 outline-none cursor-pointer">
          <option value="off">Subtitles: Off</option>
        </select>

        <!-- Quality Selector -->
        <select id="qualitySelect" onchange="switchQuality(this.value)" class="bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-2.5 py-1 outline-none cursor-pointer">
          <option value="-1">Quality: Auto</option>
        </select>
      </div>
    </div>

  </div>

  <script>
    const sources = <?= json_encode($sources) ?>;
    const subtitles = <?= json_encode($subtitles) ?>;
    let hls = null;

    function initPlayer() {
      const video = document.getElementById('videoPlayer');
      if (!video || !sources.length) return;

      // 1. INJECT WEBVTT SUBTITLES
      const subSelect = document.getElementById('subtitleSelect');
      if (subtitles && subtitles.length > 0) {
        subSelect.innerHTML = '<option value="off">Subtitles: Off</option>';
        subtitles.forEach((sub, idx) => {
          const track = document.createElement('track');
          track.kind = 'subtitles';
          track.label = sub.label || sub.lang;
          track.srclang = sub.lang || 'en';
          track.src = sub.url;
          video.appendChild(track);

          const opt = document.createElement('option');
          opt.value = idx;
          opt.innerText = `CC: ${sub.label || sub.lang}`;
          subSelect.appendChild(opt);
        });
      } else {
        subSelect.innerHTML = '<option value="off">No Subtitles Found</option>';
      }

      // 2. POPULATE DUB LANGUAGE SELECTOR (Stream-Level)
      const audioSelect = document.getElementById('audioSelect');
      const langStreams = sources.filter(s => s.language || (s.label && s.label.includes('—')));
      if (langStreams.length > 1) {
        audioSelect.innerHTML = '';
        langStreams.forEach((src, idx) => {
          const opt = document.createElement('option');
          opt.value = `src_${idx}`;
          opt.innerText = `Audio: ${src.label || src.language}`;
          audioSelect.appendChild(opt);
        });
      }

      // 3. ATTACH HLS.JS
      const primaryUrl = sources[0].url;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(primaryUrl);
        hls.attachMedia(video);

        // Quality levels
        hls.on(Hls.Events.MANIFEST_PARSED, (e, data) => {
          const qSelect = document.getElementById('qualitySelect');
          if (data.levels && data.levels.length > 1) {
            qSelect.innerHTML = '<option value="-1">Quality: Auto</option>';
            data.levels.forEach((lvl, idx) => {
              const opt = document.createElement('option');
              opt.value = idx;
              opt.innerText = `${lvl.height}p (${Math.round(lvl.bitrate/1000)} kbps)`;
              qSelect.appendChild(opt);
            });
          }
          video.play().catch(() => {});
        });

        // Layer 1: In-manifest HLS v7 audio tracks
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (e, data) => {
          if (data.audioTracks && data.audioTracks.length > 1) {
            audioSelect.innerHTML = '';
            data.audioTracks.forEach((t, idx) => {
              const opt = document.createElement('option');
              opt.value = `hls_${idx}`;
              opt.innerText = `Audio: ${t.name || t.lang || `Track ${idx + 1}`}`;
              audioSelect.appendChild(opt);
            });
          }
        });

        // Step-by-step auto-failover on HLS fatal error
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.warn('HLS Fatal Error on server [<?= $usedSrv ?>]:', data.details);
            const serverKeys = <?= json_encode(array_keys($servers)) ?>;
            const currentIdx = serverKeys.indexOf('<?= $usedSrv ?>');
            if (currentIdx !== -1 && currentIdx + 1 < serverKeys.length) {
              const nextServer = serverKeys[currentIdx + 1];
              console.log('Auto-stepping to next scraper server: ' + nextServer);
              const url = new URL(window.location.href);
              url.searchParams.set('srv', nextServer);
              window.location.href = url.toString();
            } else {
              alert('All scraper servers encountered HLS fatal errors. Please try again later.');
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = primaryUrl;
      }
    }

    // Toggle Subtitles
    function switchSubtitle(trackIdx) {
      const video = document.getElementById('videoPlayer');
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = (trackIdx !== 'off' && i === parseInt(trackIdx)) ? 'showing' : 'disabled';
      }
    }

    // Switch Audio
    function switchAudio(val) {
      if (val.startsWith('hls_')) {
        if (hls) hls.audioTrack = parseInt(val.replace('hls_', ''));
      } else if (val.startsWith('src_')) {
        const idx = parseInt(val.replace('src_', ''));
        if (sources[idx] && hls) {
          hls.loadSource(sources[idx].url);
          hls.attachMedia(document.getElementById('videoPlayer'));
        }
      }
    }

    // Switch Quality
    function switchQuality(val) {
      if (hls) hls.currentLevel = parseInt(val);
    }

    window.addEventListener('DOMContentLoaded', initPlayer);
  </script>
</body>
</html>
