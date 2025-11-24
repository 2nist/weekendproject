import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { showErrorToast, AppError } from '../../utils/errorHandling';

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
  syncWithContext?: boolean;
}

export const AudioEngine = forwardRef<AudioEngineRef, AudioEngineProps>(
  (
    {
      src,
      onTimeUpdate,
      onPlay,
      onPause,
      onEnded,
      autoPlay = false,
      projectId,
      songFilename,
      syncWithContext = true,
    },
    ref,
  ) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const { state, actions } = useEditor();

    // ✅ PERFORMANCE FIX: Track requestAnimationFrame ID for cleanup
    const rafIdRef = useRef<number | null>(null);

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
      if (!syncWithContext) return;
      if (state.isPlaying && !isPlaying) {
        audioRef.current?.play();
      } else if (!state.isPlaying && isPlaying) {
        audioRef.current?.pause();
      }
    }, [state.isPlaying, isPlaying, syncWithContext]);

    // Update EditorContext with current time using requestAnimationFrame for smooth updates
    // ✅ PERFORMANCE FIX: Properly cleanup rAF to prevent memory leak on unmount
    const updateTime = useCallback(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);
        if (syncWithContext) {
          actions.setPlaybackTime?.(time);
        }
        onTimeUpdate?.(time);
        rafIdRef.current = requestAnimationFrame(updateTime);
      }
    }, [isPlaying, actions, onTimeUpdate, syncWithContext]);

    useEffect(() => {
      if (isPlaying) {
        rafIdRef.current = requestAnimationFrame(updateTime);
      }

      // ✅ Cleanup: Cancel animation frame on unmount or when playback stops
      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
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
        console.log('[AudioEngine] Play event fired');
        console.trace('[AudioEngine] Play event stack trace');
        setIsPlaying(true);
        if (onPlay) onPlay();
      };

      const handlePause = () => {
        console.log('[AudioEngine] Pause event fired');
        console.trace('[AudioEngine] Pause event stack trace');
        setIsPlaying(false);
        if (onPause) onPause();
      };

      const handleEnded = () => {
        console.log('[AudioEngine] Ended event fired');
        setIsPlaying(false);
        if (onEnded) onEnded();
      };

      const handleError = (e: Event) => {
        console.error('[AudioEngine] Audio error:', e);
        const audio = e.target as HTMLAudioElement;
        console.error('[AudioEngine] Error details:', {
          error: audio.error,
          errorCode: audio.error?.code,
          errorMessage: audio.error?.message,
          src: audio.src,
          networkState: audio.networkState,
          readyState: audio.readyState,
        });

        // Log error codes for debugging
        if (audio.error) {
          const errorMessages: Record<number, string> = {
            1: 'MEDIA_ERR_ABORTED - The user aborted the video playback',
            2: 'MEDIA_ERR_NETWORK - A network error occurred',
            3: 'MEDIA_ERR_DECODE - Error decoding the media',
            4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Media source not supported',
          };
          console.error(
            '[AudioEngine] Error type:',
            errorMessages[audio.error.code] || 'Unknown error',
          );

          // Show user-friendly error message
          const userFriendlyMessages: Record<number, string> = {
            1: 'Audio playback was interrupted.',
            2: 'Network error occurred while loading audio. Please check your connection.',
            3: 'Audio file could not be decoded. The file may be corrupted or in an unsupported format.',
            4: 'Audio format not supported. Please try a different audio file.',
          };

          const appError = new AppError(
            `Audio playback error: ${errorMessages[audio.error.code] || 'Unknown error'}`,
            'AUDIO_ERROR',
            userFriendlyMessages[audio.error.code] ||
              'An error occurred while playing the audio file.',
            true, // Recoverable - user can try different file
          );
          showErrorToast(appError);
        }
      };

      const handleCanPlay = () => {
        console.log('[AudioEngine] Audio can play - duration:', audioRef.current?.duration);
      };

      const handleLoadedMetadata = () => {
        console.log('[AudioEngine] Metadata loaded - src:', audioRef.current?.src);
      };

      const handleWaiting = () => {
        console.log('[AudioEngine] Waiting event');
      };

      const handleStalled = () => {
        console.log('[AudioEngine] Stalled event');
      };

      const handleSuspend = () => {
        console.log('[AudioEngine] Suspend event');
      };

      const handleAbort = () => {
        console.log('[AudioEngine] Abort event');
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('waiting', handleWaiting);
      audio.addEventListener('stalled', handleStalled);
      audio.addEventListener('suspend', handleSuspend);
      audio.addEventListener('abort', handleAbort);

      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('waiting', handleWaiting);
        audio.removeEventListener('stalled', handleStalled);
        audio.removeEventListener('suspend', handleSuspend);
        audio.removeEventListener('abort', handleAbort);
      };
    }, [onTimeUpdate, onPlay, onPause, onEnded]);

    // Update src when it changes
    useEffect(() => {
      if (audioRef.current && mediaUrl && mediaUrl !== audioRef.current.src) {
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
