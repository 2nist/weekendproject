import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { useEditor } from '../../contexts/EditorContext';

export interface AudioEngineRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
}

export interface AudioEngineProps {
  src?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  projectId?: string;
  songFilename?: string;
}

export const AudioEngine = forwardRef<AudioEngineRef, AudioEngineProps>(
  (
    { src, onTimeUpdate, onPlay, onPause, onEnded, autoPlay = false, projectId, songFilename },
    ref,
  ) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const { state, actions } = useEditor();

    // Build media URL from project data
    const mediaUrl = React.useMemo(() => {
      if (projectId && songFilename) {
        return `media://${projectId}/${songFilename}`;
      }
      return src;
    }, [projectId, songFilename, src]);

    // Only log when URL actually changes, not on every render
    React.useEffect(() => {
      console.log('[AudioEngine] Media URL changed:', mediaUrl);
    }, [mediaUrl]);

    useImperativeHandle(ref, () => ({
      play: () => {
        audioRef.current?.play();
        setIsPlaying(true);
      },
      pause: () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      },
      seek: (time: number) => {
        if (audioRef.current) {
          audioRef.current.currentTime = time;
        }
      },
      getCurrentTime: () => {
        return audioRef.current?.currentTime || 0;
      },
      getDuration: () => {
        return audioRef.current?.duration || 0;
      },
      isPlaying: () => {
        return isPlaying;
      },
    }));

    // Sync with EditorContext playback state
    useEffect(() => {
      if (state.isPlaying && !isPlaying) {
        audioRef.current?.play();
      } else if (!state.isPlaying && isPlaying) {
        audioRef.current?.pause();
      }
    }, [state.isPlaying, isPlaying]);

    // Update EditorContext with current time using requestAnimationFrame for smooth updates
    const updateTime = useCallback(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);
        actions.setPlaybackTime?.(time);
        onTimeUpdate?.(time);
        requestAnimationFrame(updateTime);
      }
    }, [isPlaying, actions, onTimeUpdate]);

    useEffect(() => {
      if (isPlaying) {
        requestAnimationFrame(updateTime);
      }
    }, [isPlaying, updateTime]);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const handleTimeUpdate = () => {
        if (onTimeUpdate) {
          onTimeUpdate(audio.currentTime);
        }
      };

      const handlePlay = () => {
        setIsPlaying(true);
        if (onPlay) onPlay();
      };

      const handlePause = () => {
        setIsPlaying(false);
        if (onPause) onPause();
      };

      const handleEnded = () => {
        setIsPlaying(false);
        if (onEnded) onEnded();
      };

      const handleError = (e: Event) => {
        console.error('[AudioEngine] Audio error:', e);
        const audio = e.target as HTMLAudioElement;
        console.error('[AudioEngine] Error details:', {
          error: audio.error,
          src: audio.src,
          networkState: audio.networkState,
          readyState: audio.readyState,
        });
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);

      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
      };
    }, [onTimeUpdate, onPlay, onPause, onEnded]);

    // Update src when it changes
    useEffect(() => {
      if (audioRef.current && mediaUrl) {
        console.log('[AudioEngine] Setting audio src to:', mediaUrl);
        audioRef.current.src = mediaUrl;
        audioRef.current.load();
      }
    }, [mediaUrl]);

    return (
      <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} autoPlay={autoPlay} />
    );
  },
);

AudioEngine.displayName = 'AudioEngine';
