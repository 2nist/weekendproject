import React from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import BeatEditor from './BeatEditor';
import SectionEditor from './SectionEditor';
import SongOverview from './SongOverview';
import LyricsPanel from './LyricsPanel';

export default function InspectorPanel({ children }: Readonly<{ children?: React.ReactNode }>) {
  const { state } = useEditor();
  const selection = state.selection;

  // 🔴 THE FIX: Constrain container to prevent ScrollArea layout loop
  const containerClass = "flex flex-col h-full min-h-0 overflow-hidden bg-card border-l border-border";
  
  if (!selection) {
    return (
      <div className={containerClass}>
        {children}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full w-full">
            <div className="p-4 space-y-4">
              <SongOverview />
              <LyricsPanel />
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  if (selection.type === 'beat') {
    return (
      <div className={containerClass}>
        {children}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full w-full">
            <BeatEditor />
          </ScrollArea>
        </div>
      </div>
    );
  }

  if (selection.type === 'section') {
    return (
      <div className={containerClass}>
        {children}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full w-full">
            <SectionEditor />
          </ScrollArea>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      {children}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full w-full">
          <div className="p-4 space-y-4">
            <SongOverview />
            <LyricsPanel />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
