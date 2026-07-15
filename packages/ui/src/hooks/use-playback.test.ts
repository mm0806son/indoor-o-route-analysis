import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePlayback } from "./use-playback";

describe("usePlayback", () => {
  it("defaults to not playing, speed 4, and following enabled", () => {
    const { result } = renderHook(() => usePlayback());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playbackSpeed).toBe(4);
    expect(result.current.playReset).toBe(0);
    expect(result.current.followPlayback).toBe(true);
  });

  it("honors defaultSpeed and defaultFollow options", () => {
    const { result } = renderHook(() => usePlayback({ defaultSpeed: 2, defaultFollow: false }));
    expect(result.current.playbackSpeed).toBe(2);
    expect(result.current.followPlayback).toBe(false);
  });

  it("togglePlay flips isPlaying without touching playReset", () => {
    const { result } = renderHook(() => usePlayback());
    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.playReset).toBe(0);
    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(false);
  });

  it("stopPlay stops playback and increments playReset", () => {
    const { result } = renderHook(() => usePlayback());
    act(() => result.current.togglePlay());
    act(() => result.current.stopPlay());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playReset).toBe(1);
  });

  it("resetPlayback increments playReset without touching isPlaying", () => {
    const { result } = renderHook(() => usePlayback());
    act(() => result.current.togglePlay());
    act(() => result.current.resetPlayback());
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.playReset).toBe(1);
  });

  it("setIsPlaying/setPlaybackSpeed/setFollowPlayback act as direct setters", () => {
    const { result } = renderHook(() => usePlayback());
    act(() => result.current.setIsPlaying(true));
    expect(result.current.isPlaying).toBe(true);
    act(() => result.current.setPlaybackSpeed(8));
    expect(result.current.playbackSpeed).toBe(8);
    act(() => result.current.setFollowPlayback(false));
    expect(result.current.followPlayback).toBe(false);
  });

  describe("resetDeps", () => {
    it("increments playReset when a resetDeps value changes", () => {
      const { result, rerender } = renderHook(
        ({ leg }) => usePlayback({ resetDeps: [leg] }),
        { initialProps: { leg: "1-2" } },
      );
      expect(result.current.playReset).toBe(0);
      rerender({ leg: "2-3" });
      expect(result.current.playReset).toBe(1);
    });

    it("does not increment playReset when resetDeps is a new array with the same content", () => {
      const { result, rerender } = renderHook(
        ({ leg }) => usePlayback({ resetDeps: [leg] }),
        { initialProps: { leg: "1-2" } },
      );
      rerender({ leg: "1-2" }); // new array instance, same element value
      expect(result.current.playReset).toBe(0);
    });

    // Not tested: resetDeps changing length between renders. React's own
    // useEffect dependency-array diffing requires a constant-length array
    // (per the Rules of Hooks), so a length change breaks change detection
    // before the hook's own length-comparison branch ever runs - not a
    // realistic scenario, since both real call sites pass a fixed-shape
    // tuple (see route-builder/index.tsx's `[selectedLegIndex, selectedRoute?.id]`).
  });

  describe("spacebar shortcut", () => {
    it("toggles isPlaying on Space when spacebarEnabled is true", () => {
      const { result } = renderHook(() => usePlayback({ spacebarEnabled: true }));
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      });
      expect(result.current.isPlaying).toBe(true);
    });

    it("does nothing on Space when spacebarEnabled is false", () => {
      const { result } = renderHook(() => usePlayback({ spacebarEnabled: false }));
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      });
      expect(result.current.isPlaying).toBe(false);
    });

    it("ignores Space when the event target is a text input", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      const { result } = renderHook(() => usePlayback({ spacebarEnabled: true }));
      act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
      });
      expect(result.current.isPlaying).toBe(false);
      document.body.removeChild(input);
    });

    it("removes its keydown listener on unmount", () => {
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const { unmount } = renderHook(() => usePlayback({ spacebarEnabled: true }));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
