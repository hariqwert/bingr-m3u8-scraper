#!/usr/bin/env node

/**
 * 🎬 Bingr Anime M3U8 Stream Scraper CLI
 * Supports: All 5 Servers (beep, yuki, neko, zuna, loli) + AniSkip Skip Intro/Ending
 * 
 * Usage:
 *   node anime_cli.js "One Piece" 1000
 *   node anime_cli.js "Attack on Titan" 1 --type dub
 *   node anime_cli.js 21 1000 --race
 */

const {
  searchAnime,
  getAnimeDetails,
  getAnimeStreams,
  getSkipTimes,
  speedRaceAnimeServers
} = require('./animeScraper');

// ANSI formatting
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m'
};

function banner() {
  console.log(`\n${c.cyan}${c.bold}╔══════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}${c.bold}║        ⚡ BINGR ANIME M3U8 STREAM SCRAPER & EXTRACTOR ⚡         ║${c.reset}`);
  console.log(`${c.cyan}${c.bold}║    Servers: [beep] · [yuki] · [neko] · [zuna] · [loli] + AniSkip ║${c.reset}`);
  console.log(`${c.cyan}${c.bold}╚══════════════════════════════════════════════════════════════════╝${c.reset}\n`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    banner();
    console.log(`Usage:`);
    console.log(`  node anime_cli.js <title|anilistId> <episode> [options]\n`);
    console.log(`Options:`);
    console.log(`  --type <sub|dub>    Audio track preference (default: sub)`);
    console.log(`  --race              Test liveness & latency across all 5 servers`);
    console.log(`  --json              Output full stream response as JSON\n`);
    console.log(`Examples:`);
    console.log(`  node anime_cli.js "One Piece" 1000`);
    console.log(`  node anime_cli.js "Jujutsu Kaisen" 1 --type dub`);
    console.log(`  node anime_cli.js 21 1000 --race\n`);
    process.exit(0);
  }

  const queryOrId = args[0];
  const episode = parseInt(args[1], 10) || 1;
  const isDub = args.includes('--dub') || args.includes('dub');
  const typeIndex = args.indexOf('--type');
  const type = typeIndex !== -1 && args[typeIndex + 1] ? args[typeIndex + 1].toLowerCase() : (isDub ? 'dub' : 'sub');
  const shouldRace = args.includes('--race');
  const asJson = args.includes('--json');

  return { queryOrId, episode, type, shouldRace, asJson };
}

async function main() {
  const { queryOrId, episode, type, shouldRace, asJson } = parseArgs();

  if (!asJson) banner();

  try {
    let anilistId = null;
    let malId = null;
    let title = '';
    let year = '';

    // Check if query is numeric AniList ID
    if (/^\d+$/.test(queryOrId.trim())) {
      anilistId = parseInt(queryOrId.trim(), 10);
      if (!asJson) console.log(`${c.dim}Fetching anime metadata for AniList ID: ${anilistId}...${c.reset}`);
      try {
        const d = await getAnimeDetails(anilistId);
        title = d.title || `Anime #${anilistId}`;
        malId = d.idMal || null;
        year = d.year || '';
      } catch (e) {
        title = `Anime #${anilistId}`;
      }
    } else {
      if (!asJson) console.log(`${c.dim}Searching AniList catalog for "${queryOrId}"...${c.reset}`);
      const results = await searchAnime(queryOrId);
      if (!results.length) {
        console.error(`${c.red}✖ No anime found matching "${queryOrId}"${c.reset}`);
        process.exit(1);
      }
      const top = results[0];
      anilistId = top.id;
      malId = top.idMal;
      title = top.title;
      year = top.year || '';
    }

    if (!asJson) {
      console.log(`${c.green}${c.bold}✔ Anime Matched:${c.reset} ${c.bold}${title}${c.reset} ${year ? `(${year})` : ''}`);
      console.log(`  ${c.dim}AniList ID:${c.reset} ${anilistId} | ${c.dim}MAL ID:${c.reset} ${malId || 'N/A'} | ${c.dim}Episode:${c.reset} ${episode} | ${c.dim}Mode:${c.reset} ${type.toUpperCase()}`);
    }

    // Fetch Skip Intro / Outro timestamps in parallel
    let skipData = { found: false, intervals: [] };
    if (malId) {
      if (!asJson) console.log(`${c.dim}Checking AniSkip database for OP/ED intervals...${c.reset}`);
      skipData = await getSkipTimes(malId, episode);
      if (!asJson) {
        if (skipData.found && skipData.intervals.length) {
          console.log(`  ${c.yellow}⏩ Skip Intervals Found:${c.reset}`);
          skipData.intervals.forEach(i => {
            console.log(`     • [${i.type.toUpperCase()}] ${c.bold}${i.label}${c.reset}: ${i.startFormatted} ➔ ${i.endFormatted} (${i.start}s - ${i.end}s)`);
          });
        } else {
          console.log(`  ${c.dim}No AniSkip markers found for this episode.${c.reset}`);
        }
      }
    }

    // Extract streams from the 5 servers
    if (!asJson) console.log(`\n${c.cyan}Fetching stream clusters across the 5 anime servers...${c.reset}`);
    const streamResult = await getAnimeStreams({
      anilistId,
      episode,
      type,
      title,
      idMal: malId
    });

    if (asJson) {
      console.log(JSON.stringify(streamResult, null, 2));
      return;
    }

    if (!streamResult.sources.length) {
      console.log(`${c.red}✖ No streams found for episode ${episode} (${type}).${c.reset}`);
      return;
    }

    console.log(`\n${c.green}${c.bold}✔ Extracted ${streamResult.sources.length} Active Servers:${c.reset}\n`);

    streamResult.sources.forEach((s, idx) => {
      console.log(`${c.bold}━━━ [SERVER ${idx + 1}: ${s.server.toUpperCase()}] ━━━${c.reset}`);
      console.log(`  ${c.cyan}Stream URL:${c.reset}    ${s.url}`);
      console.log(`  ${c.cyan}Proxy URL:${c.reset}     ${s.proxyUrl}`);
      console.log(`  ${c.cyan}Referer:${c.reset}       ${s.referer || 'None required'}`);
      console.log(`  ${c.cyan}Quality / Type:${c.reset} ${s.quality} / ${s.type}`);
      if (s.subtitles && s.subtitles.length) {
        console.log(`  ${c.cyan}Subtitles:${c.reset}     ${s.subtitles.length} track(s) [${s.subtitles.map(sub => sub.lang).join(', ')}]`);
      }
      console.log('');
    });

    if (shouldRace) {
      console.log(`${c.yellow}🏎️ Running Speed Race across all 5 servers...${c.reset}`);
      const race = await speedRaceAnimeServers(streamResult.sources);
      console.log('\n📊 Server Latency Rankings:');
      race.rankings.forEach(r => {
        const icon = r.ok ? `${c.green}✔ LIVE${c.reset}` : `${c.red}✖ OFF ${c.reset}`;
        console.log(`  ${icon} [${r.server.toUpperCase().padEnd(6)}] Latency: ${r.latency}ms ${r.isHls ? '(Valid HLS)' : ''}`);
      });

      if (race.fastest) {
        console.log(`\n${c.bgGreen}${c.bold} 🏆 FASTEST LIVE SERVER: ${race.fastest.server.toUpperCase()} (${race.fastest.latency}ms) ${c.reset}`);
        console.log(`  Playback URL: ${race.fastest.source.url}\n`);
      }
    }

    console.log(`${c.dim}Tip: Run "php -S 127.0.0.1:8080 play.php" to watch with interactive server switching and automated Skip Intro!${c.reset}\n`);

  } catch (err) {
    console.error(`\n${c.red}✖ Error:${c.reset}`, err.message);
    process.exit(1);
  }
}

main();
