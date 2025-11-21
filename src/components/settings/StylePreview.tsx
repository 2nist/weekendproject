import React from 'react';
import { BeatCard } from '@/components/grid/BeatCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const StylePreview: React.FC = () => {
  return (
    <Card className="w-full h-fit sticky top-6 bg-slate-900/50 backdrop-blur border-slate-800">
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-widest text-slate-500">Live Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs text-slate-400">Rhythm Layer Contrast</label>
          <div className="flex gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800/50 justify-center">
            <BeatCard beatIndex={0} chord="C" roman="I" function="tonic" isKick={true} className="pointer-events-none" />
            <BeatCard beatIndex={1} chord="G7" roman="V" function="dominant" isSnare={true} className="pointer-events-none" />
            <BeatCard beatIndex={2} chord="Bdim" roman="vii°" function="diminished" isKick={true} isSnare={true} className="pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400">Harmonic Progression Flow</label>
          <div className="flex gap-2 p-4 bg-slate-950 rounded-xl border border-slate-800/50 overflow-hidden justify-center opacity-90">
            <BeatCard beatIndex={0} chord="Dm" function="subdominant" className="scale-75 origin-center" />
            <BeatCard beatIndex={1} chord="G" function="dominant" className="scale-75 origin-center" />
            <BeatCard beatIndex={2} chord="C" function="tonic" className="scale-75 origin-center" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StylePreview;
