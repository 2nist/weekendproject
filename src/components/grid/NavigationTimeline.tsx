import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { findSignificantPeaks } from '@/utils/novelty';

interface Section {
  section_id: string;
  section_label: string;
  time_range: {
    start_time: number;
    end_time: number;
  };
  color?: string;
}

interface NavigationTimelineProps {
  sections: Section[];
  noveltyCurve?: number[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onSectionClick?: (section: Section) => void;
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

const SECTION_COLORS: Record<string, string> = {
  verse: 'rgb(59, 130, 246)', // blue-500
  chorus: 'rgb(239, 68, 68)', // red-500
  bridge: 'rgb(249, 115, 22)', // orange-500
  intro: 'rgb(34, 197, 94)', // green-500
  outro: 'rgb(168, 85, 247)', // purple-500
  default: 'rgb(107, 114, 128)', // gray-500
};

export const NavigationTimeline: React.FC<NavigationTimelineProps> = ({
  sections,
  noveltyCurve = [],
  duration,
  currentTime,
  onSeek,
  onSectionClick,
  scrollContainerRef,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);

  // Calculate section positions and colors
  const sectionBlocks = useMemo(() => {
    if (!duration || duration === 0) return [];
    return sections.map((section) => {
      const start = section.time_range?.start_time || 0;
      const end = section.time_range?.end_time || duration;
      const label = (section.section_label || '').toLowerCase();

      // Determine color based on section label
      let color = SECTION_COLORS.default;
      if (label.includes('verse')) color = SECTION_COLORS.verse;
      else if (label.includes('chorus')) color = SECTION_COLORS.chorus;
      else if (label.includes('bridge')) color = SECTION_COLORS.bridge;
      else if (label.includes('intro')) color = SECTION_COLORS.intro;
      else if (label.includes('outro')) color = SECTION_COLORS.outro;
      else if (section.color) {
        // Use custom color if provided
        color = section.color;
      }

      return {
        section,
        start,
        end,
        startPercent: (start / duration) * 100,
        widthPercent: ((end - start) / duration) * 100,
        color,
      };
    });
  }, [sections, duration]);

  // Calculate playhead position
  const playheadPosition = useMemo(() => {
    if (!duration || duration === 0) return 0;
    const time = isDragging && dragPosition !== null ? dragPosition : currentTime;
    return Math.min((time / duration) * 100, 100);
  }, [currentTime, duration, isDragging, dragPosition]);

  // Get persisted detection method & param from settings
  const { settings } = useSettings();
  const detectionMethod = settings?.analysis_noveltyMethod || 'mad';
  const detectionParam = parseFloat(settings?.analysis_noveltyParam) || 1.5;

  // Determine significant peaks across the whole curve using persisted settings
  const significantPeakFrames = useMemo(() => {
    try {
      return findSignificantPeaks(noveltyCurve, detectionMethod as any, detectionParam);
    } catch (e) {
      return [];
    }
  }, [noveltyCurve, detectionMethod, detectionParam]);

  // Normalize novelty curve for display
  const normalizedCurve = useMemo(() => {
    if (!noveltyCurve.length || !duration) return [];
    const maxVal = Math.max(...noveltyCurve, 1);
    const frameHop = duration / noveltyCurve.length;

    return noveltyCurve.map((value, index) => ({
      time: index * frameHop,
      value: value / maxVal, // Normalize to 0-1
      percent: (index / noveltyCurve.length) * 100,
    }));
  }, [noveltyCurve, duration]);

  // Handle click on timeline
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const time = (percent / 100) * duration;

      onSeek(time);

      // Find which section was clicked and scroll to it
      const clickedSection = sectionBlocks.find(
        (block) =>
          percent >= block.startPercent && percent <= block.startPercent + block.widthPercent,
      );

      if (clickedSection && onSectionClick) {
        onSectionClick(clickedSection.section);
      }

      // Scroll the main grid to the clicked section
      if (clickedSection && scrollContainerRef?.current) {
        const sectionElement = document.querySelector(
          `[data-section-id="${clickedSection.section.section_id}"]`,
        );
        if (sectionElement) {
          sectionElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      }
    },
    [duration, onSeek, sectionBlocks, onSectionClick, scrollContainerRef],
  );

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const time = (percent / 100) * duration;
      setDragPosition(time);
      onSeek(time);
    },
    [duration, onSeek],
  );

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const time = (percent / 100) * duration;
      setDragPosition(time);
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragPosition(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, duration, onSeek]);

  if (!duration || duration === 0) {
    return null;
  }

  return (
    <div className="h-20 border-t border-slate-800 bg-slate-950/90 backdrop-blur">
      <div
        ref={timelineRef}
        className="relative h-full w-full cursor-pointer select-none"
        onClick={handleTimelineClick}
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Novelty Curve Background */}
        {normalizedCurve.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="noveltyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <polyline
              points={normalizedCurve
                .map((point) => `${point.percent},${100 - point.value * 100}`)
                .join(' ')}
              fill="url(#noveltyGradient)"
              stroke="rgb(99, 102, 241)"
              strokeWidth="1"
              strokeOpacity="0.4"
            />
            {/* Significant peak markers */}
            {significantPeakFrames.length > 0 &&
              significantPeakFrames.map((p) => {
                const percent = (p / noveltyCurve.length) * 100;
                const frame = p;
                const frameTime = (frame / noveltyCurve.length) * duration;
                return (
                  <circle
                    key={`nav-sig-${p}`}
                    cx={`${percent}%`}
                    cy={`${10}%`}
                    r={2}
                    fill="#ff7b72"
                    stroke="#fff"
                    strokeWidth={0.5}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSeek(frameTime);
                    }}
                  />
                );
              })}
          </svg>
        )}

        {/* Section Blocks */}
        {sectionBlocks.map((block) => (
          <div
            key={block.section.section_id}
            className="absolute h-full border-r border-slate-700/50 transition-opacity hover:opacity-80"
            style={{
              left: `${block.startPercent}%`,
              width: `${block.widthPercent}%`,
              backgroundColor: block.color,
              opacity: 0.6,
            }}
            title={block.section.section_label}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] pointer-events-none z-10"
          style={{ left: `${playheadPosition}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-cyan-400 rounded-full border-2 border-slate-950" />
        </div>

        {/* Time Labels (optional, can be toggled) */}
        <div className="absolute bottom-0 left-0 right-0 h-4 text-[10px] text-slate-500 pointer-events-none">
          <div className="absolute left-0 px-1">0:00</div>
          <div className="absolute right-0 px-1">
            {Math.floor(duration / 60)}:
            {Math.floor(duration % 60)
              .toString()
              .padStart(2, '0')}
          </div>
        </div>
      </div>
    </div>
  );
};
