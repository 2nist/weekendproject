import axios from 'axios';
const logger = require('../analysis/logger');

const BASE_URL = 'https://lrclib.net/api';

export interface LyricsData {
  plain: string;
  synced: string; // The raw LRC string
  id: number;
}

export interface ParsedLyricLine {
  time: number; // in seconds
  text: string;
}

export async function fetchLyrics(artist: string, title: string): Promise<LyricsData | null> {
  try {
    // 1. Search for the track
    const query = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });

    const res = await axios.get(`${BASE_URL}/get?${query}`);

    if (res.data) {
      return {
        plain: res.data.plainLyrics,
        synced: res.data.syncedLyrics,
        id: res.data.id,
      };
    }
    return null;
  } catch (e) {
    logger.warn(`[Lyrics] Not found for ${artist} - ${title}`);
    return null;
  }
}

export function parseLRC(lrcString: string): ParsedLyricLine[] {
  const lines = lrcString.split('\n');
  const parsed: ParsedLyricLine[] = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const centiseconds = parseInt(match[3], 10);
      const time = minutes * 60 + seconds + centiseconds / 100;
      const text = match[4].trim();
      if (text) {
        parsed.push({ time, text });
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}
