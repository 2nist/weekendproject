import React, { useEffect, useRef } from 'react';
import { useLyrics } from '../../hooks/useLyrics';

interface LyricsPanelProps {
  artist: string;
  title: string;
  album?: string;
  duration: number;
  currentTime: number; // Current playback time in seconds
}

const LyricsPanel: React.FC<LyricsPanelProps> = ({
  artist,
  title,
  album,
  duration,
  currentTime,
}) => {
  const { lines, loading, error, source } = useLyrics(artist, title, album, duration);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentTime]);

  // Find the index of the current line
  const activeIndex = lines.findIndex((line, index) => {
    const nextLine = lines[index + 1];
    return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-gray-400 animate-pulse">Searching for lyrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-gray-500">No lyrics available</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-lg overflow-hidden">
      <div className="text-xs text-gray-500 p-2 border-b border-slate-700 flex items-center justify-between">
        <span>Lyrics</span>
        <span className="text-gray-600">Source: {source}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-center">
        {lines.map((line, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;

          return (
            <div
              key={index}
              ref={isActive ? activeLineRef : null}
              className={`transition-all duration-300 ${
                isActive
                  ? 'text-white text-xl font-bold scale-105'
                  : isPast
                    ? 'text-slate-600 text-base'
                    : 'text-slate-500 text-lg blur-[1px]'
              }`}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LyricsPanel;
