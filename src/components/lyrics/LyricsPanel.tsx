import React, { useEffect, useRef } from 'react';
import { useLyrics } from '@/hooks/useLyrics';
import type { SectionLyricLine } from '@/utils/lyrics';

interface LyricsPanelProps {
  artist: string;
  title: string;
  album?: string;
  duration: number;
  currentTime: number; // Current playback time in seconds
  manualLines?: SectionLyricLine[];
  manualSource?: string;
}

const LyricsPanel: React.FC<LyricsPanelProps> = ({
  artist,
  title,
  album,
  duration,
  currentTime,
  manualLines = [],
  manualSource,
}) => {
  const hasManual = manualLines.length > 0;
  const { lines, loading, error, source } = useLyrics(artist, title, album, duration, {
    enabled: !hasManual,
  });
  const resolvedLines = hasManual ? manualLines : lines;
  const resolvedSource = hasManual ? manualSource || 'Manual' : source;
  const resolvedLoading = hasManual ? false : loading;
  const resolvedError = hasManual ? null : error;
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

  // Group lines by section
  const groupedLines = React.useMemo(() => {
    const groups: Record<string, SectionLyricLine[]> = {};
    resolvedLines.forEach((line) => {
      const section = line.section_label || 'Unknown Section';
      if (!groups[section]) groups[section] = [];
      groups[section].push(line);
    });
    return groups;
  }, [resolvedLines]);

  const activeIndex = React.useMemo(() => {
    if (!resolvedLines.length) return -1;

    const indexByWindow = resolvedLines.findIndex((line, index) => {
      const lineStart = typeof line.time === 'number' ? line.time : 0;
      const duration = typeof line.duration === 'number' ? line.duration : 0;
      const nextStart = resolvedLines[index + 1]?.time;

      if (duration > 0) {
        return currentTime >= lineStart && currentTime < lineStart + duration;
      }

      if (typeof nextStart === 'number') {
        return currentTime >= lineStart && currentTime < nextStart;
      }

      return currentTime >= lineStart;
    });

    if (indexByWindow !== -1) return indexByWindow;

    const lastIndex = resolvedLines.length - 1;
    const lastLineTime = resolvedLines[lastIndex]?.time;
    if (typeof lastLineTime === 'number' && currentTime >= lastLineTime) {
      return lastIndex;
    }

    return -1;
  }, [currentTime, resolvedLines]);

  // Find active section and line index within section
  const activeSection = React.useMemo(() => {
    if (activeIndex === -1) return null;
    const activeLine = resolvedLines[activeIndex];
    return activeLine?.section_label || 'Unknown Section';
  }, [activeIndex, resolvedLines]);

  const activeLineInSection = React.useMemo(() => {
    if (!activeSection || activeIndex === -1) return -1;
    return (
      groupedLines[activeSection]?.findIndex((line) => line === resolvedLines[activeIndex]) ?? -1
    );
  }, [activeSection, activeIndex, groupedLines, resolvedLines]);

  if (resolvedLoading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-gray-400 animate-pulse">Searching for lyrics...</div>
      </div>
    );
  }

  if (resolvedError) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-red-400">{resolvedError}</div>
      </div>
    );
  }

  if (resolvedLines.length === 0) {
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
        <span className="text-gray-600">Source: {resolvedSource || 'Unknown'}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-center">
        {Object.entries(groupedLines).map(([sectionLabel, lines]) => (
          <div key={sectionLabel} className="space-y-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
              {sectionLabel}
            </div>
            <div className="space-y-4">
              {lines.map((line, sectionIndex) => {
                const globalIndex = resolvedLines.indexOf(line);
                const isActive = globalIndex === activeIndex;
                const isPast = globalIndex < activeIndex;

                return (
                  <div
                    key={globalIndex}
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
        ))}
      </div>
    </div>
  );
};

export default LyricsPanel;
