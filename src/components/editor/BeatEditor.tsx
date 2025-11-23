/**
 * Beat Editor
 * Inspector panel form for editing beat properties
 * Opens when a beat is selected (via right-click "Edit Chord" or direct selection)
 */

import React, { useEffect, useState } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { Button } from '@/components/ui/button';
import { Circle, Square, Music, Save } from 'lucide-react';

export default function BeatEditor() {
  const { state, actions } = useEditor();
  const selection = state.selection;
  const beat = selection?.data || {};
  const beatId = selection?.id || beat?.id || beat?.timestamp?.toString() || 'unknown';

  const [chord, setChord] = useState(beat?.chord || beat?.chordLabel || '');
  const [hasKick, setHasKick] = useState(Boolean(beat?.drums?.hasKick));
  const [hasSnare, setHasSnare] = useState(Boolean(beat?.drums?.hasSnare));

  useEffect(() => {
    if (selection?.type === 'beat') {
      setChord(beat?.chord || beat?.chordLabel || '');
      setHasKick(Boolean(beat?.drums?.hasKick));
      setHasSnare(Boolean(beat?.drums?.hasSnare));
    }
  }, [selection?.id, beat?.id, beat?.chord, beat?.chordLabel, beat?.drums?.hasKick, beat?.drums?.hasSnare]);

  const handleSave = () => {
    if (!actions.updateBeat) return;
    actions.updateBeat(beatId, { chord, hasKick, hasSnare });
  };

  const handleKickToggle = () => {
    const newKick = !hasKick;
    setHasKick(newKick);
    if (actions.updateBeat) {
      actions.updateBeat(beatId, { hasKick: newKick });
    }
  };

  const handleSnareToggle = () => {
    const newSnare = !hasSnare;
    setHasSnare(newSnare);
    if (actions.updateBeat) {
      actions.updateBeat(beatId, { hasSnare: newSnare });
    }
  };

  if (!selection || selection.type !== 'beat') {
    return (
      <div className="h-full p-4 text-muted-foreground text-sm">
        Select a beat to edit its properties
      </div>
    );
  }

  return (
    <div className="h-full p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Beat Editor</h3>
          <p className="text-xs text-muted-foreground mt-1">Beat ID: {beatId}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Chord Input */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <Music className="h-4 w-4" />
            Chord
          </label>
          <input
            type="text"
            value={chord}
            onChange={(e) => setChord(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave();
                e.currentTarget.blur();
              }
            }}
            className="w-full px-3 py-2 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="C, Dm7, G7, Am"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Enter chord name (e.g., C, Dm, G7, Amaj7)
          </p>
        </div>

        {/* Drums Toggle */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Drums</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleKickToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                hasKick
                  ? 'bg-music-kick border-music-kick text-card-foreground'
                  : 'bg-card border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Circle className="h-4 w-4" />
              <span>Kick</span>
            </button>
            <button
              type="button"
              onClick={handleSnareToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                hasSnare
                  ? 'bg-music-snare border-music-snare text-card-foreground'
                  : 'bg-card border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Square className="h-4 w-4" />
              <span>Snare</span>
            </button>
          </div>
        </div>

        {/* Metadata Display */}
        {(beat?.timestamp !== undefined || beat?.beatIndex !== undefined) && (
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground space-y-1">
              {beat?.timestamp !== undefined && (
                <div>Timestamp: {beat.timestamp.toFixed(2)}s</div>
              )}
              {beat?.beatIndex !== undefined && (
                <div>Beat Index: {beat.beatIndex + 1}</div>
              )}
              {beat?.functionLabel && (
                <div>Function: {beat.functionLabel}</div>
              )}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-2">
          <Button onClick={handleSave} className="w-full" size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
