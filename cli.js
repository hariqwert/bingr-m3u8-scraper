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
  node cli.js servers                            List all active scraper server clusters

Examples:
  node cli.js search "Kill"
  node cli.js movie 1108427
  node cli.js movie 1108427 s62
  node cli.js tv 1396 1 1
  node cli.js episodes 1396 1
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

    printHelp();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
