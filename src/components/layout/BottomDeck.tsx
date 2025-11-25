import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { AudioEngine, AudioEngineRef } from '../player/AudioEngine';
import { useEditor } from '../../contexts/EditorContext';
import { cn } from '@/lib/utils';
import { buildAppProtocolUrl } from '@/utils/audio';

interface BottomDeckProps {
  className?: string;
  projectId?: string;
  songFilename?: string;
}

export const BottomDeck: React.FC<BottomDeckProps> = ({
  className,
  projectId: propProjectId,
  songFilename: propSongFilename,
}) => {
  // Remove console.log from render - it causes spam
  // console.log('[BottomDeck] Rendering with props:', { propProjectId, propSongFilename });
  const audioRef = useRef<AudioEngineRef>(null);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const { state, actions } = useEditor();

  // Get audio source from EditorContext
  const songData = state.songData;
  const filePath = songData?.file_path || songData?.metadata?.file_path;
  const fileHash = songData?.fileHash || songData?.file_hash;
  const metadataExtension =
    songData?.metadata?.file_extension ||
    songData?.metadata?.fileExtension ||
    songData?.metadata?.format;

  // Debug logging (throttled)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[BottomDeck] Audio data:', {
        hasSongData: !!songData,
        hasFilePath: !!filePath,
        hasFileHash: !!fileHash,
        filePath: filePath,
        fileHash: fileHash,
        songDataKeys: songData ? Object.keys(songData) : [],
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [!!songData, !!filePath, !!fileHash]);

  // Convert file path to proper URL format
  const getAudioUrl = (
    hash: string | undefined,
    path: string | undefined,
    extensionHint?: string | null,
  ): string | undefined => {
    if (hash) {
      // Prefer app:// protocol with fileHash for better reliability
      return buildAppProtocolUrl(hash, {
        filePath: path,
        metadataExtension: extensionHint,
      });
    }

    if (!path) return undefined;

    // If already a media:// or http(s):// URL, return as-is
    if (path.startsWith('media://') || path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    // Convert to media:// protocol for Electron (avoids CORS/security issues)
    // The media:// protocol handler in main.js will resolve the file path
    let normalized = path.replace(/\\/g, '/');

    // Remove any existing file:// prefix
    normalized = normalized.replace(/^file:\/\/\/?/, '');

    // Use media:// protocol with the full path
    // Format: media://C:/path/to/file.mp3
    return `media://${normalized}`;
  };

  const audioUrl = getAudioUrl(fileHash, filePath, metadataExtension);

  // Debug logging - show what URL we're using
  React.useEffect(() => {
    if (audioUrl) {
      console.log('[BottomDeck] Audio URL:', audioUrl);
    }
  }, [audioUrl]);

  // Update duration when audio loads (only when songData actually changes, not on every render)
  const songDataId = songData?.id || songData?.fileHash || songData?.file_hash;
  useEffect(() => {
    if (audioRef.current && songDataId) {
      const dur = audioRef.current.getDuration();
      if (dur > 0) {
        setDuration(dur);
      }
    }
  }, [songDataId]); // Only depend on the ID, not the whole object

  // Handle spacebar for play/pause
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        actions.togglePlayback();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [actions]);

  const handlePlayPause = () => {
    actions.togglePlayback();
  };

  const handleSkipBack = () => {
    if (audioRef.current) {
      const newTime = Math.max(0, currentTime - 10);
      audioRef.current.seek(newTime);
      actions.setPlaybackTime(newTime);
    }
  };

  const handleSkipForward = () => {
    if (audioRef.current) {
      const newTime = Math.min(duration, currentTime + 10);
      audioRef.current.seek(newTime);
      actions.setPlaybackTime(newTime);
    }
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    audioRef.current.seek(newTime);
    actions.setPlaybackTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      // Note: HTML5 audio volume control would need to be added to AudioEngine
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      // Note: HTML5 audio mute control would need to be added to AudioEngine
    }
  };

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Show message if no audio file available
  const hasAudio = !!audioUrl;
  if (!hasAudio) {
    return (
      <div
        className={cn(
          'h-20 bg-card border-t border-border flex flex-col items-center justify-center text-muted-foreground text-sm gap-1',
          className,
        )}
      >
        <div>{songData ? 'Audio file path not found in analysis data' : 'No analysis loaded'}</div>
        {songData && (
          <div className="text-xs opacity-70">
            FileHash: {songData.fileHash || songData.file_hash || 'none'} | Has file_path:{' '}
            {songData.file_path ? 'yes' : 'no'} | Has metadata.file_path:{' '}
            {songData.metadata?.file_path ? 'yes' : 'no'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('h-20 bg-card border-t border-border flex items-center px-6 gap-4', className)}
    >
      {/* Transport Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSkipBack}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          title="Skip back 10s"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          onClick={handlePlayPause}
          className="p-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          title={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {state.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>

        <button
          onClick={handleSkipForward}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          title="Skip forward 10s"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Time Display */}
      <div className="flex items-center gap-2 text-sm font-mono min-w-[100px]">
        <span>{formatTime(state.playbackTime)}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{formatTime(duration)}</span>
      </div>

      {/* Progress Bar */}
      <div
        className="flex-1 h-2 bg-muted rounded-full cursor-pointer relative"
        onClick={handleScrub}
      >
        <div
          className="h-full bg-primary rounded-full transition-all duration-100"
          style={{ width: duration > 0 ? `${(state.playbackTime / duration) * 100}%` : '0%' }}
        />
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMute}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-20 h-1 bg-muted rounded-full appearance-none cursor-pointer slider"
          title="Volume"
        />
      </div>

      {/* Hidden Audio Engine */}
      <AudioEngine
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={(time) => {
          setCurrentTime(time);
          actions.setPlaybackTime(time);
        }}
        onPlay={() => actions.setProcessing(false)}
        onPause={() => actions.setProcessing(false)}
        onEnded={() => {
          actions.setPlaybackTime(0);
          setCurrentTime(0);
        }}
      />
    </div>
  );
};

export default BottomDeck;
