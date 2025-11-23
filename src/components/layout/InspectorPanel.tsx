import React from 'react';
import { useLocation } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function InspectorPanel({ children }: { children?: React.ReactNode }) {
  const loc = useLocation();
  const path = loc.pathname;
  let content = null;
  if (children) content = children;
  else if (path.startsWith('/library')) {
    content = (
      <div>
        <h4 className="text-sm font-medium text-foreground">Library Inspector</h4>
        <p className="text-xs text-muted-foreground">Filter and metadata options for library items.</p>
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
          <div>Selected: None</div>
          <div>Tracks: 0</div>
          <div>Imports: 0</div>
        </div>
      </div>
    );
  } else if (path.startsWith('/sandbox')) {
    content = (
      <div>
        <h4 className="text-sm font-medium text-foreground">Sandbox Inspector</h4>
        <p className="text-xs text-muted-foreground">Project and arrangement-specific controls.</p>
      </div>
    );
  } else if (path.startsWith('/analysis')) {
    content = (
      <div>
        <h4 className="text-sm font-medium text-foreground">Analysis Inspector</h4>
        <p className="text-xs text-muted-foreground">Tuner and analysis controls.</p>
      </div>
    );
  } else content = <div className="text-muted-foreground">Select a block to inspect its properties here.</div>;
  
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Inspector</h3>
      </div>
      
      {/* 🔴 THE FIX: flex-1 and min-h-0 prevents the ScrollArea layout loop */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full w-full">
          <div className="p-4">
            {content}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
