const https = require('https');
const logger = require('../analysis/logger');

// Helper to make a simple GET request
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse response'));
          }
        } else {
          // If 404, just resolve null (no lyrics found)
          if (res.statusCode === 404) resolve(null);
          else reject(new Error(`Request failed with status ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchLyrics(artist, title, album, duration) {
  try {
    // 1. Try precise match (requires duration)
    // Lrclib documentation emphasizes duration is crucial for the /api/get endpoint
    if (duration) {
      const params = new URLSearchParams({
        artist_name: artist,
        track_name: title,
        album_name: album || '',
        duration: Math.round(duration), // Duration must be in seconds
      });

      logger.debug(`[LYRICS] Fetching precise match: ${params.toString()}`);
      const preciseData = await makeRequest(`https://lrclib.net/api/get?${params}`);

      if (preciseData && (preciseData.syncedLyrics || preciseData.plainLyrics)) {
        return {
          plain: preciseData.plainLyrics,
          synced: preciseData.syncedLyrics,
          source: 'lrclib (precise)',
        };
      }
    }

    // 2. Fallback: Search (fuzzy match)
    const searchParams = new URLSearchParams({
      q: `${artist} ${title}`,
    });

    logger.debug(`[LYRICS] precise match failed, trying search: ${searchParams.toString()}`);
    const searchResults = await makeRequest(`https://lrclib.net/api/search?${searchParams}`);

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      // Pick the first result that has synced lyrics
      const bestMatch = searchResults.find((r) => r.syncedLyrics) || searchResults[0];
      return {
        plain: bestMatch.plainLyrics,
        synced: bestMatch.syncedLyrics,
        source: 'lrclib (search)',
      };
    }

    return null;
  } catch (error) {
    logger.error('[LYRICS] Error fetching lyrics:', error.message);
    return null;
  }
}

// Simple LRC parser to convert string to array of { time, text }
function parseLRC(lrcString) {
  if (!lrcString) return [];
  const lines = lrcString.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
      const time = minutes * 60 + seconds + milliseconds / 1000;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }
  return result;
}

module.exports = { fetchLyrics, parseLRC };
