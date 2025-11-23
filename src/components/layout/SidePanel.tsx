import React from 'react';
import { useLocation } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function SidePanel() {
  const loc = useLocation();
  const path = loc.pathname;

  let header = 'Explorer';
  let content = <p className="text-xs text-muted-foreground">Select a view from the Activity Bar</p>;

  if (path.startsWith('/library')) {
    header = 'Library Filters';
    content = (
      <ul className="space-y-1 mt-3">
        <li className="px-2 py-1.5 text-sm text-foreground hover:bg-accent rounded cursor-pointer">All Songs</li>
        <li className="px-2 py-1.5 text-sm text-foreground hover:bg-accent rounded cursor-pointer">Favorites</li>
        <li className="px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent rounded cursor-pointer">Recent</li>
        <li className="px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent rounded cursor-pointer">Analyzed</li>
        <li className="px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent rounded cursor-pointer">By Genre</li>
      </ul>
    );
  } else if (path.startsWith('/sandbox')) {
    header = 'Project Files';
    content = (
      <ul className="space-y-1 mt-3">
        <li className="px-2 py-1.5 text-sm text-foreground hover:bg-accent rounded cursor-pointer flex items-center gap-2">
          <span className="text-primary">♪</span> Audio Track
        </li>
        <li className="px-2 py-1.5 text-sm text-foreground hover:bg-accent rounded cursor-pointer flex items-center gap-2">
          <span className="text-music-subdominant">♪</span> MIDI Data
        </li>
        <li className="px-2 py-1.5 text-sm text-foreground hover:bg-accent rounded cursor-pointer flex items-center gap-2">
          <span className="text-music-diminished">♪</span> Analysis Result
        </li>
      </ul>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-muted/10 border-r border-border">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-border font-semibold text-foreground flex-shrink-0">
        {header}
      </div>

      {/* 🔴 THE FIX: flex-1 and min-h-0 prevents the ScrollArea layout loop */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full w-full">
          <div className="p-3">
            {content}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
