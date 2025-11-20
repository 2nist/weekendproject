import React from 'react';
import useAppIPC from '../hooks/useAppIPC';

export default function Toolbar() {
  const { sendCommand, status, connected } = useAppIPC();

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
      <button
        onClick={handlePlay}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 disabled:opacity-50 disabled:pointer-events-none"
        aria-pressed={isPlaying}
        aria-disabled={!connected}
        disabled={!connected}
        title="Play"
      >
        ▶ Play
      </button>

      <button
        onClick={handleStop}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
        title="Stop"
      >
        ■ Stop
      </button>

      <button
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
      </button>

      <div className="ml-4 text-sm text-muted-foreground">
        BPM: <span className="font-medium">{status?.bpm ?? '—'}</span>
      </div>
    </div>
  );
}
