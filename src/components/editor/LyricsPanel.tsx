import React, { useState, useEffect, useRef } from 'react';
import { useEditor } from '@/contexts/EditorContext';

interface ParsedLyricLine {
  timestamp: number;
  text: string;
}

interface LyricsData {
  plain: string;
  synced: string;
  parsed: ParsedLyricLine[];
}

export default function LyricsPanel() {
  const { state } = useEditor();
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const lyricsRef = useRef<HTMLDivElement>(null);

  // Get artist and title from metadata
  const metadata = state.songData?.linear_analysis?.metadata || {};
  const artist = metadata.artist || metadata.artist_name || 'Unknown Artist';
  const title = metadata.title || metadata.track_name || 'Unknown Title';

  // Fetch lyrics when component mounts or metadata changes
  useEffect(() => {
    if (!artist || !title || artist === 'Unknown Artist' || title === 'Unknown Title') {
      setLyrics(null);
      return;
    }

    const fetchLyrics = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await globalThis.electron.getLyrics({ artist, title });

        if (result.success && result.lyrics) {
          setLyrics(result.lyrics);
        } else {
          setError(result.error || 'Lyrics not found');
          setLyrics(null);
        }
      } catch (err) {
        console.error('Failed to fetch lyrics:', err);
        setError('Failed to fetch lyrics');
        setLyrics(null);
      } finally {
        setLoading(false);
      }
    };

    fetchLyrics();
  }, [artist, title]);

  // Listen for playback time updates from EditorContext
  useEffect(() => {
    setCurrentTime(state.playbackTime);
    setIsPlaying(state.isPlaying);
  }, [state.playbackTime, state.isPlaying]);

  // Auto-scroll to current lyric line
  useEffect(() => {
    if (!lyrics?.parsed || !lyricsRef.current) return;

    const currentLineIndex = lyrics.parsed.findIndex((line, index) => {
      const nextLine = lyrics.parsed[index + 1];
      return currentTime >= line.timestamp && (!nextLine || currentTime < nextLine.timestamp);
    });

    if (currentLineIndex >= 0) {
      const lineElement = lyricsRef.current.children[currentLineIndex] as HTMLElement;
      if (lineElement) {
        lineElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentTime, lyrics?.parsed]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const centis = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="h-full p-4">
        <h4 className="text-sm font-medium text-foreground mb-2">Lyrics</h4>
        <div className="flex items-center justify-center h-32">
          <div className="text-sm text-muted-foreground">Loading lyrics...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full p-4">
        <h4 className="text-sm font-medium text-foreground mb-2">Lyrics</h4>
        <div className="flex items-center justify-center h-32">
          <div className="text-sm text-muted-foreground text-center">
            <div className="mb-2">No lyrics found</div>
            <div className="text-xs opacity-75">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!lyrics) {
    return (
      <div className="h-full p-4">
        <h4 className="text-sm font-medium text-foreground mb-2">Lyrics</h4>
        <div className="flex items-center justify-center h-32">
          <div className="text-sm text-muted-foreground text-center">
            <div className="mb-2">No song metadata available</div>
            <div className="text-xs opacity-75">
              Artist: {artist}
              <br />
              Title: {title}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-foreground">Lyrics</h4>
        <div className="text-xs text-muted-foreground">
          {artist} - {title}
        </div>
      </div>

      <div className="space-y-1">
        {/* Plain lyrics fallback */}
        {lyrics.plain && !lyrics.parsed?.length && (
          <div className="text-sm text-foreground whitespace-pre-wrap max-h-96 overflow-y-auto">
            {lyrics.plain}
          </div>
        )}

        {/* Synced lyrics */}
        {lyrics.parsed && lyrics.parsed.length > 0 && (
          <div ref={lyricsRef} className="text-sm max-h-96 overflow-y-auto space-y-1">
            {lyrics.parsed.map((line, index) => {
              const isCurrent =
                isPlaying &&
                (() => {
                  const nextLine = lyrics.parsed[index + 1];
                  return (
                    currentTime >= line.timestamp && (!nextLine || currentTime < nextLine.timestamp)
                  );
                })();

              return (
                <div
                  key={`${line.timestamp}-${line.text}`}
                  className={`transition-colors duration-200 ${
                    isCurrent
                      ? 'text-primary font-medium bg-primary/10 px-2 py-1 rounded'
                      : 'text-foreground hover:bg-muted/50 px-2 py-1 rounded'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono min-w-[40px]">
                      {formatTime(line.timestamp)}
                    </span>
                    <span className="flex-1">{line.text || '♪'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Current playback indicator */}
        {isPlaying && (
          <div className="text-xs text-muted-foreground text-center py-2 border-t">
            <div className="mt-1">Playing at {formatTime(currentTime)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
