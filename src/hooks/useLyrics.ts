import { useState, useEffect } from 'react';
import logger from '@/lib/logger';

// Define the structure of the lyrics response
interface LyricLine {
  time: number;
  text: string;
}

interface LyricsState {
  lines: LyricLine[];
  source: string;
  loading: boolean;
  error: string | null;
}

interface UseLyricsOptions {
  enabled?: boolean;
}

export function useLyrics(
  artist: string,
  title: string,
  album?: string,
  duration?: number,
  options?: UseLyricsOptions,
) {
  const [lyrics, setLyrics] = useState<LyricsState>({
    lines: [],
    source: '',
    loading: false,
    error: null,
  });
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    // Avoid fetching when metadata is invalid or default placeholders
    if (!artist || !title) return;
    if (
      artist.trim().toLowerCase() === 'unknown artist' ||
      title.trim().toLowerCase() === 'unknown track'
    ) {
      // Wait for valid metadata to be populated
      logger.debug('[useLyrics] Waiting for valid metadata: artist/title placeholder detected');
      return;
    }

    const fetchLyrics = async () => {
      setLyrics((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Use the exposed electronAPI from preload
        const response = await (window as any).electronAPI.invoke('LYRICS:GET', {
          artist,
          title,
          album,
          duration,
        });

        if (response.success && response.lyrics) {
          setLyrics({
            lines: response.lyrics.parsed || [], // The parsed LRC lines
            source: response.lyrics.source || 'Unknown',
            loading: false,
            error: null,
          });
        } else {
          setLyrics((prev) => ({
            ...prev,
            loading: false,
            error: response.error || 'Lyrics not found',
          }));
        }
      } catch (err) {
        logger.error('[useLyrics] Error fetching lyrics:', err);
        setLyrics((prev) => ({ ...prev, loading: false, error: 'Failed to load lyrics' }));
      }
    };

    fetchLyrics();
  }, [artist, title, album, duration, enabled]);

  return lyrics;
}
