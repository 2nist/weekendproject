import React from 'react';
import useAppIPC from '../hooks/useAppIPC';
import Button from './ui/Button';

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
      <Button
        onClick={handlePlay}
        variant={isPlaying ? 'success' : 'default'}
        aria-pressed={isPlaying}
        aria-disabled={!connected}
        disabled={!connected}
        title="Play"
      >
        ▶ Play
      </Button>

      <Button onClick={handleStop} variant="default" title="Stop">
        ■ Stop
      </Button>

      <Button
        onClick={handleRecord}
        variant={isRecording ? 'danger' : 'default'}
        aria-pressed={isRecording}
        aria-disabled={!connected}
        disabled={!connected}
        title="Record"
      >
        ⦿ Record
      </Button>

      <div className="ml-4 text-sm text-gray-700">
        BPM: <span className="font-medium">{status?.bpm ?? '—'}</span>
      </div>
    </div>
  );
}
