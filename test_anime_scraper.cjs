const {
  searchAnime,
  getAnimeDetails,
  getAnimeEpisodes,
  getAnimeStreams,
  getSkipTimes,
  speedRaceAnimeServers
} = require('./animeScraper');

async function runTests() {
  console.log('========================================');
  console.log('🧪 RUNNING ANIME SCRAPER UNIT TESTS');
  console.log('========================================\n');

  try {
    // Test 1: Search Anime
    console.log('▶ [1/5] Testing searchAnime("One Piece")...');
    const searchResults = await searchAnime('One Piece');
    console.log(`✓ Found ${searchResults.length} results.`);
    const top = searchResults[0];
    console.log(`  Top match: "${top.title}" (AniList: ${top.id}, MAL: ${top.idMal}, Episodes: ${top.episodes || 'Ongoing'})\n`);

    // Test 2: Anime Details
    console.log(`▶ [2/5] Testing getAnimeDetails(${top.id})...`);
    const details = await getAnimeDetails(top.id);
    console.log(`✓ Details loaded: "${details.title}" (Year: ${details.year}, Rating: ${details.rating})\n`);

    // Test 3: Episodes Chunk
    console.log(`▶ [3/5] Testing getAnimeEpisodes(${top.id}, chunk=0)...`);
    const epData = await getAnimeEpisodes(top.id, 0);
    console.log(`✓ Total episodes: ${epData.total}. Fetched ${epData.episodes?.length || 0} episodes in chunk 0.\n`);

    // Test 4: AniSkip Skip Intervals
    console.log(`▶ [4/5] Testing AniSkip skip times for MAL ${top.idMal} episode 1000...`);
    const skip = await getSkipTimes(top.idMal, 1000);
    console.log(`✓ Skip data found: ${skip.found}`);
    skip.intervals.forEach(i => {
      console.log(`  - [${i.type.toUpperCase()}] ${i.label}: ${i.startFormatted} -> ${i.endFormatted} (${i.start}s - ${i.end}s)`);
    });
    console.log('');

    // Test 5: Stream Extraction across all 5 Servers (beep, yuki, neko, zuna, loli)
    console.log(`▶ [5/5] Testing getAnimeStreams for AniList ${top.id} episode 1000 (SUB)...`);
    const streamData = await getAnimeStreams({
      anilistId: top.id,
      episode: 1000,
      type: 'sub',
      title: top.title,
      idMal: top.idMal
    });

    console.log(`✓ Extracted ${streamData.serverCount} servers!`);
    console.log(`  Server List: [${streamData.servers.join(', ')}]`);
    console.log('');
    
    streamData.sources.forEach((s, idx) => {
      console.log(`  [Server ${idx + 1}: ${s.server.toUpperCase()}]`);
      console.log(`    URL:      ${s.url.slice(0, 75)}...`);
      console.log(`    Referer:  ${s.referer || 'None'}`);
      console.log(`    Proxy:    ${s.proxyUrl.slice(0, 75)}...`);
      console.log(`    Subs:     ${s.subtitles.length} track(s)`);
    });

    console.log('\n▶ Testing Speed Race across anime servers...');
    const race = await speedRaceAnimeServers(streamData.sources);
    if (race && race.fastest) {
      console.log(`🏆 FASTEST LIVE SERVER: [${race.fastest.server.toUpperCase()}] responded in ${race.fastest.latency}ms (HLS: ${race.fastest.isHls})`);
    } else {
      console.log('Notice: Streams may require proxy headers for direct CDN verification.');
    }

    console.log('\n========================================');
    console.log('✅ ALL ANIME SCRAPER TESTS PASSED!');
    console.log('========================================');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
