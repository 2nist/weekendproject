import React, { useState } from 'react';
import useAppIPC from '../hooks/useAppIPC';
import { Button } from './ui/button';
import AnalysisTuner from './tools/AnalysisTuner';

export default function Toolbar({ openSandbox, openSettings } = {}) {
  const { sendCommand, status, connected } = useAppIPC();
  const [showTuner, setShowTuner] = useState(false);

  // status is expected to contain { isPlaying, isRecording, bpm, ... }
  const isPlaying = Boolean(status?.isPlaying);
  const isRecording = Boolean(status?.isRecording);

  async function handlePlay() {
    try {
      await sendCommand('NETWORK:SEND_MACRO', { id: 'MACRO_PLAY' });
    } catch (err) {
      console.error('Play command failed', err);
    }
  }

  async function handleStop() {
    try {
      await sendCommand('NETWORK:SEND_MACRO', { id: 'MACRO_STOP' });
    } catch (err) {
      console.error('Stop command failed', err);
    }
  }

  async function handleRecord() {
    try {
      await sendCommand('NETWORK:SEND_MACRO', { id: 'MACRO_RECORD' });
    } catch (err) {
      console.error('Record command failed', err);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Button
        onClick={handlePlay}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 disabled:opacity-50 disabled:pointer-events-none"
        aria-pressed={isPlaying}
        aria-disabled={!connected}
        disabled={!connected}
        title="Play"
      >
        ▶ Play
      </Button>

      <Button
        onClick={handleStop}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
        title="Stop"
      >
        ■ Stop
      </Button>

      <Button
        onClick={handleRecord}
        className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 disabled:opacity-50 disabled:pointer-events-none ${
          isRecording
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
        }`}
        aria-pressed={isRecording}
        aria-disabled={!connected}
        disabled={!connected}
        title="Record"
      >
        ⦿ Record
      </Button>

      <div className="ml-4 text-sm text-muted-foreground">
        BPM: <span className="font-medium">{status?.bpm ?? '—'}</span>
      </div>
      <div className="ml-4 relative">
        <Button
          onClick={() => setShowTuner((s) => !s)}
          className="ml-2 px-2 py-1 text-xs"
          title="Analysis Lab"
        >
          🎛️ Analysis Lab
        </Button>
        {showTuner && (
          <div className="absolute right-0 bottom-12 z-50">
            <AnalysisTuner fileHash={window.__lastAnalysisHash || null} onUpdate={() => {}} />
          </div>
        )}
      </div>
      {openSandbox ? (
        <Button
          onClick={() => openSandbox()}
          className="ml-4 px-2 py-1 text-xs"
          title="Open Sandbox"
        >
          Sandbox
        </Button>
      ) : null}
      <Button
        onClick={() => openSettings && openSettings()}
        className="ml-2 px-2 py-1 text-xs"
        title="Settings"
      >
        🎨 Theme
      </Button>
    </div>
  );
}
