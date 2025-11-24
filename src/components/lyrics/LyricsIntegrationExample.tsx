import React from 'react';
import LyricsPanel from './LyricsPanel';

/**
 * Example integration of LyricsPanel in SandboxView
 *
 * To integrate the LyricsPanel into your SandboxView, follow these steps:
 */

// 1. Import the component at the top of SandboxView.tsx
// import LyricsPanel from '@/components/lyrics/LyricsPanel';

// 2. Extract metadata from songData (add this with other metadata extraction around line 186)
// const metadata = songData?.metadata || songData?.linear_analysis?.metadata || {};
// const artist = metadata?.artist || 'Unknown Artist';
// const title = metadata?.title || metadata?.file_name || 'Unknown Track';
// const album = metadata?.album;

// 3. Add the LyricsPanel to your layout. Here are two options:

// Option A: Add as a sidebar panel (similar to ContextualInspector)
export const LyricsIntegrationSidebar = ({
  artist,
  title,
  album,
  duration,
  currentTime,
}: {
  artist: string;
  title: string;
  album?: string;
  duration: number;
  currentTime: number;
}) => (
  <div className="w-80 h-full border-l border-border bg-card">
    <LyricsPanel
      artist={artist}
      title={title}
      album={album}
      duration={duration}
      currentTime={currentTime}
    />
  </div>
);

// Option B: Add as a collapsible bottom panel
export const LyricsIntegrationBottom = ({
  artist,
  title,
  album,
  duration,
  currentTime,
  isOpen = false,
  onToggle,
}: {
  artist: string;
  title: string;
  album?: string;
  duration: number;
  currentTime: number;
  isOpen?: boolean;
  onToggle?: () => void;
}) => (
  <div
    className={`w-full border-t border-border bg-card transition-all duration-300 ${
      isOpen ? 'h-64' : 'h-0 overflow-hidden'
    }`}
  >
    <LyricsPanel
      artist={artist}
      title={title}
      album={album}
      duration={duration}
      currentTime={currentTime}
    />
  </div>
);

// 4. In your SandboxView JSX, add the component where you want it displayed
// For example, after the ContextualInspector:

/*
  <LyricsPanel
    artist={artist}
    title={title}
    album={album}
    duration={duration}
    currentTime={currentTime}
  />
*/

// Or add a toggle button in the toolbar to show/hide lyrics:

/*
  const [showLyrics, setShowLyrics] = useState(false);
  
  // In toolbar:
  <Button
    onClick={() => setShowLyrics(!showLyrics)}
    className="gap-2"
    title="Toggle Lyrics"
  >
    <Music className="w-4 h-4" />
    Lyrics
  </Button>
  
  // At the bottom of your layout:
  <LyricsIntegrationBottom
    artist={artist}
    title={title}
    album={album}
    duration={duration}
    currentTime={currentTime}
    isOpen={showLyrics}
    onToggle={() => setShowLyrics(!showLyrics)}
  />
*/
