import React from 'react';

interface LyricDraftPanelProps {
  label?: string;
  text: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const LyricDraftPanel: React.FC<LyricDraftPanelProps> = ({
  label = 'Lyric Sketch',
  text,
  onChange,
  placeholder = 'Capture imagery, rhymes, or full lines for this section...',
}) => {
  return (
    <div className="border border-border rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-widest">{label}</h3>
        <span className="text-[11px] font-mono text-muted-foreground">blank canvas</span>
      </div>
      <textarea
        aria-label={`${label} text area`}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-3 w-full min-h-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus-visible:ring focus-visible:ring-primary/60"
      />
      <div className="mt-2 text-[11px] text-muted-foreground">
        Drafts here map directly to the lrclib-ready lyric payload once you commit sections.
      </div>
    </div>
  );
};

export default LyricDraftPanel;
