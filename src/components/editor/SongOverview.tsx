import React from 'react';
import { useEditor } from '@/contexts/EditorContext';
import KeySelector from '@/components/tools/KeySelector';

export default function SongOverview() {
  const { state, actions } = useEditor();
  const songData = state.songData;
  const profile = (songData?.metadata?.calibration_profile) || 'Rock';

  return (
    <div className="h-full p-4">
      <h4 className="text-sm font-medium text-foreground mb-2">Song Overview</h4>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Global Key</label>
          <KeySelector value={state.globalKey} onChange={(k) => actions.updateKey && actions.updateKey(k)} />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Calibration Profile</label>
          <div className="text-sm text-slate-400">{profile}</div>
        </div>
      </div>
    </div>
  );
}
