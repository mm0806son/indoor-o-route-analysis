"use client";

import { memo, useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Target,
  Layers,
  ListVideo,
} from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";

/**
 * A memoized component that renders a real-time playback timer display.
 * Shows elapsed time in m:ss format, synchronized with the playback state.
 */
export const PlaybackTimer = memo(function PlaybackTimer({
  isPlaying,
  playbackRate,
  resetKey,
  duration = 0,
}: {
  isPlaying: boolean;
  playbackRate: number;
  resetKey: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState("0:00");
  const startTimeRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const lastUpdateRef = useRef<number>(0);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Reset when resetKey changes
  useEffect(() => {
    accumulatedRef.current = 0;
    startTimeRef.current = null;
    lastUpdateRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset display on key change
    setDisplay("0:00");
  }, [resetKey]);

  // Handle snapping to end when playback stops
  useEffect(() => {
    if (!isPlaying && duration > 0) {
      if (Math.abs(accumulatedRef.current - duration) < 1.0 || accumulatedRef.current > duration) {
        accumulatedRef.current = duration;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- snap display to final time
        setDisplay(formatTime(duration));
      }
    }
  }, [isPlaying, duration]);

  useEffect(() => {
    if (isPlaying) {
      if (duration > 0 && accumulatedRef.current >= duration - 0.1) {
        accumulatedRef.current = 0;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset display at start of play
        setDisplay("0:00");
      }

      if (startTimeRef.current === null) {
        startTimeRef.current = performance.now();
        lastUpdateRef.current = startTimeRef.current;
      }

      const intervalId = setInterval(() => {
        const now = performance.now();
        const delta = (now - lastUpdateRef.current) / 1000;
        lastUpdateRef.current = now;

        accumulatedRef.current += delta * playbackRate;

        if (duration > 0 && accumulatedRef.current > duration) {
          accumulatedRef.current = duration;
        }

        const totalSeconds = Math.floor(accumulatedRef.current);
        setDisplay(formatTime(totalSeconds));
      }, 100);

      return () => {
        clearInterval(intervalId);
      };
    } else {
      startTimeRef.current = null;
    }
  }, [isPlaying, playbackRate, duration]);

  return <span className="text-xs text-muted-foreground tabular-nums ml-1 min-w-[32px]">{display}</span>;
});

export interface PlaybackControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  playReset: number;
  followPlayback: boolean;
  onTogglePlay: () => void;
  onStopPlay: () => void;
  onPlaybackSpeedChange: (speed: number) => void;
  onFollowPlaybackChange: (follow: boolean) => void;
  /** Whether playback auto-continues with the next leg when a leg finishes */
  autoAdvance?: boolean;
  /** Callback when auto-advance is toggled. Toggle is only shown when provided. */
  onAutoAdvanceChange?: (autoAdvance: boolean) => void;
  /** Whether play button is disabled */
  disabled?: boolean;
  /** Estimated duration of the current playback in seconds */
  duration?: number;
  /** Current playback time in seconds (simulation time) */
  currentTime?: number;
  /** Total playback time in seconds (simulation time) */
  totalTime?: number;
  /** Callback when user scrubs the time slider */
  onTimeChange?: (time: number) => void;
  /** Whether to show the 3D layers toggle */
  show3DControls?: boolean;
  /** Whether upper levels are hidden (for 3D) */
  hideUpperLevels?: boolean;
  /** Callback when hide upper levels changes */
  onHideUpperLevelsChange?: (hide: boolean) => void;
  /** Available speed options (defaults to [1, 2, 3, 4, 5, 10]) */
  speedOptions?: number[];
}

/**
 * Shared playback controls toolbar used by route-analysis and route-builder.
 * Contains play/pause, stop, timer, speed selector, and follow toggle.
 */
export function PlaybackControls({
  isPlaying,
  playbackSpeed,
  playReset: _playReset,
  followPlayback,
  onTogglePlay,
  onStopPlay,
  onPlaybackSpeedChange,
  onFollowPlaybackChange,
  autoAdvance = false,
  onAutoAdvanceChange,
  disabled = false,
  duration: _duration = 0,
  currentTime = 0,
  totalTime = 0,
  onTimeChange,
  show3DControls = false,
  hideUpperLevels = false,
  onHideUpperLevelsChange,
  speedOptions = [1, 2, 3, 4, 5, 10],
}: PlaybackControlsProps) {

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-1 px-2 py-2 border-b border-border bg-card">
      {/* Play/Pause */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onTogglePlay}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        disabled={disabled}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      {/* Stop */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onStopPlay}
        title="Stop and reset"
        disabled={currentTime === 0}
      >
        <Square className="h-4 w-4" />
      </Button>
      {/* Current time */}
      <span className="text-xs text-muted-foreground tabular-nums ml-1 min-w-8">
        {formatTime(currentTime)}
      </span>
      {/* Time slider - fills remaining space */}
      {totalTime > 0 && onTimeChange ? (
        <input
          type="range"
          min={0}
          max={totalTime}
          step={0.1}
          value={Math.min(currentTime, totalTime)}
          onChange={(e) => onTimeChange(parseFloat(e.target.value))}
          className="flex-1 h-1 min-w-12 bg-muted rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary"
          title="Scrub playback time"
        />
      ) : (
        <div className="flex-1" />
      )}
      {/* Route total time - right aligned after slider */}
      {totalTime > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTime(totalTime)}
        </span>
      )}
      {/* Playback Speed Selector */}
      <div className="border-l border-border h-full flex items-center">
        <Select value={playbackSpeed.toString()} onValueChange={(val) => onPlaybackSpeedChange(parseInt(val))}>
          <SelectTrigger className="h-7 border-none bg-transparent hover:bg-accent focus:ring-0 gap-1 px-2 w-auto min-w-10 text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {speedOptions.map((speed) => (
              <SelectItem key={speed} value={speed.toString()} className="text-xs">
                {speed}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* 3D-specific controls */}
      {show3DControls && onHideUpperLevelsChange && (
        <div className="px-2 border-l border-border">
          <Button
            variant={hideUpperLevels ? "active" : "ghost"}
            size="icon"
            className={`h-7 w-7 transition-all ${
              hideUpperLevels ? "" : "text-muted-foreground opacity-30"
            }`}
            onClick={() => onHideUpperLevelsChange(!hideUpperLevels)}
            title="Hide levels above current runner position"
          >
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      )}
      {/* Follow playback toggle */}
      <div className="pl-2 border-l border-border">
        <Button
          variant={followPlayback ? "active" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onFollowPlaybackChange(!followPlayback)}
          title={followPlayback ? "Disable follow" : "Enable follow"}
        >
          <Target className={`h-4 w-4 transition-all ${followPlayback ? "opacity-100" : "opacity-30"}`} />
        </Button>
      </div>
      {/* Auto-advance (continue with next leg) toggle */}
      {onAutoAdvanceChange && (
        <div className="pl-2 border-l border-border">
          <Button
            variant={autoAdvance ? "active" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => onAutoAdvanceChange(!autoAdvance)}
            title={autoAdvance ? "Disable continue with next leg" : "Enable continue with next leg"}
          >
            <ListVideo className={`h-4 w-4 transition-all ${autoAdvance ? "opacity-100" : "opacity-30"}`} />
          </Button>
        </div>
      )}
    </div>
  );
}
