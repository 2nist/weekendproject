import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

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
}

export const AudioEngine = forwardRef<AudioEngineRef, AudioEngineProps>(
  ({ src, onTimeUpdate, onPlay, onPause, onEnded, autoPlay = false }, ref) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);

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

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handleEnded);
      };
    }, [onTimeUpdate, onPlay, onPause, onEnded]);

    // Update src when it changes
    useEffect(() => {
      if (audioRef.current && src) {
        audioRef.current.src = src;
        audioRef.current.load();
      }
    }, [src]);

    return (
      <audio
        ref={audioRef}
        preload="metadata"
        style={{ display: 'none' }}
        autoPlay={autoPlay}
      />
    );
  }
);

AudioEngine.displayName = 'AudioEngine';

