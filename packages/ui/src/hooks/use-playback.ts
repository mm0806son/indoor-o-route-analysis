"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export interface PlaybackState {
  isPlaying: boolean;
  playbackSpeed: number;
  playReset: number;
  followPlayback: boolean;
}

export interface PlaybackActions {
  togglePlay: () => void;
  stopPlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setFollowPlayback: (follow: boolean) => void;
  resetPlayback: () => void;
}

export interface UsePlaybackOptions {
  /** Default playback speed multiplier */
  defaultSpeed?: number;
  /** Whether follow-playback is enabled by default */
  defaultFollow?: boolean;
  /** Dependencies that should reset the playback timer when changed */
  resetDeps?: React.DependencyList;
  /** Dependencies that should be checked for spacebar play/pause (e.g. selectedLeg !== null) */
  spacebarEnabled?: boolean;
}

/**
 * Shared hook for playback state management.
 * Used by both route-analysis and route-builder.
 */
export function usePlayback(options: UsePlaybackOptions = {}): PlaybackState & PlaybackActions {
  const {
    defaultSpeed = 4,
    defaultFollow = true,
    resetDeps = [],
    spacebarEnabled = false,
  } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(defaultSpeed);
  const [playReset, setPlayReset] = useState(0);
  const [followPlayback, setFollowPlayback] = useState(defaultFollow);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const stopPlay = useCallback(() => {
    setIsPlaying(false);
    setPlayReset((x) => x + 1);
  }, []);

  const resetPlayback = useCallback(() => {
    setPlayReset((n) => n + 1);
  }, []);

  // Reset timer when resetDeps change
  const resetDepsRef = useRef(resetDeps);
  useEffect(() => {
    // Handle array content comparison since resetDeps is likely a new array instance on every render
    let changed = resetDeps.length !== resetDepsRef.current.length;
    if (!changed) {
      for (let i = 0; i < resetDeps.length; i++) {
        if (resetDeps[i] !== resetDepsRef.current[i]) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      resetDepsRef.current = resetDeps;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- triggering reset via counter
      setPlayReset((n) => n + 1);
    }
  }, resetDeps); // eslint-disable-line react-hooks/exhaustive-deps

  // Spacebar shortcut to toggle play
  useEffect(() => {
    if (!spacebarEnabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spacebarEnabled]);

  return {
    isPlaying,
    playbackSpeed,
    playReset,
    followPlayback,
    togglePlay,
    stopPlay,
    setIsPlaying,
    setPlaybackSpeed,
    setFollowPlayback,
    resetPlayback,
  };
}
