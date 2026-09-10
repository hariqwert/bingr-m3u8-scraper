#!/usr/bin/env node
const scraper = require('./scraper');

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
🎬 Bingr M3U8 Scraper CLI

Usage:
  node cli.js search <query>                     Search for movies & TV series by title or TMDB ID
  node cli.js movie <tmdbId> [serverId]          Scrape live M3U8 stream for a movie
  node cli.js tv <tmdbId> <season> <episode>     Scrape live M3U8 stream for a specific TV episode
  node cli.js episodes <tmdbId> <season>         List all episodes in a TV season
  node cli.js sports                             List today's live and upcoming sports matches
  node cli.js sport-stream <source> <matchId>    Scrape live M3U8 for a sports match
  node cli.js servers                            List all active scraper server clusters

Examples:
  node cli.js search "Kill"
  node cli.js movie 1108427
  node cli.js tv 1396 1 1
  node cli.js sports
  node cli.js sport-stream solaris 247-fox-footy
`);
}

async function run() {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  try {
    if (command === 'servers') {
      console.log('\n--- Active Scraper Clusters ---');
      scraper.SERVERS.forEach(s => {
        console.log(`[${s.id}] ${s.name} (${s.cc})`);
      });
      console.log('');
      return;
    }

    if (command === 'search') {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error('Error: Please provide a search query.');
        return;
      }
      console.log(`🔍 Searching TMDB for: "${query}"...`);
      const results = await scraper.search(query);
      const items = results.results || [];
      console.log(`\nFound ${items.length} result(s):\n`);
      items.slice(0, 10).forEach(item => {
        const type = item.type || (item.first_air_date ? 'tv' : 'movie');
        const year = item.year || (item.release_date || item.first_air_date || '').slice(0, 4);
        console.log(`• [${type.toUpperCase()}] ${item.title || item.name} (${year}) - TMDB ID: ${item.id}`);
      });
      console.log('');
      return;
    }

    if (command === 'movie') {
      const tmdbId = args[1];
      const srv = args[2];
      if (!tmdbId) {
        console.error('Error: Please specify TMDB ID. Example: node cli.js movie 1108427');
        return;
      }
      console.log(`🚀 Scraping stream for Movie TMDB: ${tmdbId}${srv ? ` on server [${srv}]` : ' (Auto-Cascade)'}...`);
      const result = await scraper.scrapeMovie(tmdbId, { srv });
      if (result.success) {
        console.log('\n✅ Stream Scraped Successfully!');
        console.log('Title:       ', result.title);
        console.log('Year:        ', result.year);
        console.log('Server:      ', `${result.serverName} [${result.serverId}]`);
        console.log('Quality:     ', result.quality);
        console.log('Primary M3U8:', result.primaryM3u8);
        console.log('\nAvailable Sources:');
        result.sources.forEach((src, idx) => {
          console.log(`  [#${idx + 1}] ${src.quality || 'Auto'} - ${src.url}`);
        });
      } else {
        console.error('\n❌ Scraper failed to extract stream.');
        console.error(result.error);
      }
      return;
    }

    if (command === 'episodes') {
      const tmdbId = args[1];
      const season = args[2] || 1;
      if (!tmdbId) {
        console.error('Error: Please specify TV TMDB ID. Example: node cli.js episodes 1396 1');
        return;
      }
      console.log(`📺 Fetching episodes for TV Show ${tmdbId} Season ${season}...`);
      const episodes = await scraper.getTvEpisodes(tmdbId, season);
      console.log(`\nFound ${episodes.length} episode(s) in Season ${season}:\n`);
      episodes.forEach(ep => {
        console.log(`• S${season}E${ep.episode}: "${ep.title}" (Rating: ${ep.rating || 'N/A'})`);
      });
      console.log('');
      return;
    }

    if (command === 'tv') {
      const tmdbId = args[1];
      const season = args[2] || 1;
      const episode = args[3] || 1;
      const srv = args[4];

      if (!tmdbId) {
        console.error('Error: Please specify TMDB ID, Season, and Episode. Example: node cli.js tv 1396 1 1');
        return;
      }

      console.log(`🚀 Scraping stream for TV Show ${tmdbId} Season ${season} Episode ${episode}...`);
      const result = await scraper.scrapeTvEpisode(tmdbId, season, episode, { srv });

      if (result.success) {
        console.log('\n✅ TV Episode Stream Scraped Successfully!');
        console.log('Title:       ', result.title);
        console.log('Episode:     ', `Season ${result.season} Episode ${result.episode}`);
        console.log('Server:      ', `${result.serverName} [${result.serverId}]`);
        console.log('Quality:     ', result.quality);
        console.log('Primary M3U8:', result.primaryM3u8);
        console.log('\nAvailable Sources:');
        result.sources.forEach((src, idx) => {
          console.log(`  [#${idx + 1}] ${src.quality || 'Auto'} - ${src.url}`);
        });
      } else {
        console.error('\n❌ Scraper failed to extract stream.');
        console.error(result.error);
      }
      return;
    }

    if (command === 'sports') {
      console.log('🏟️  Fetching live and upcoming sports matches today...');
      const matches = await scraper.getLiveSportsMatches();
      const list = matches.today || [];
      console.log(`\nFound ${list.length} match(es) today:\n`);

      list.forEach((m, idx) => {
        const teams = m.teams?.home?.name ? `${m.teams.home.name} vs ${m.teams.away?.name || 'TBA'}` : m.title;
        const time = m.date ? new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const sourceInfo = m.sources?.[0] ? `[src: ${m.sources[0].source} / id: ${m.sources[0].id}]` : '';
        console.log(`• [${(m.category || 'LIVE').toUpperCase()}] ${teams} (${time}) ${sourceInfo}`);
      });

      console.log('\nTo scrape a stream, run: node cli.js sport-stream <source> <id>');
      return;
    }

    if (command === 'sport-stream') {
      const source = args[1];
      const matchId = args[2];
      if (!source || !matchId) {
        console.error('Error: Please specify source and matchId. Example: node cli.js sport-stream solaris 247-fox-footy');
        return;
      }
      console.log(`🚀 Scraping live stream for match: ${matchId} from source [${source}]...`);
      const streamData = await scraper.getMatchStream(source, matchId);
      console.log(`\nFound ${streamData.streams.length} stream source(s):`);

      streamData.streams.forEach((s, idx) => {
        console.log(`\n[Stream #${idx + 1}] ${s.name} (${s.language})`);
        console.log(`  M3U8 / URL: ${s.url}`);
      });
      return;
    }

    printHelp();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
