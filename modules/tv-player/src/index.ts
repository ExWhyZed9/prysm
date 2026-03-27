import { requireNativeViewManager, Platform } from "expo-modules-core";
import React from "react";
import { ViewStyle } from "react-native";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TvPlayerLoadParams {
  url: string;
  headers?: Record<string, string>;
  drmType?: "widevine" | "playready" | "clearkey";
  drmLicenseUrl?: string;
  drmHeaders?: Record<string, string>;
  autoPlay?: boolean;
}

export interface TvPlayerViewProps {
  style?: ViewStyle;
  onReady?: () => void;
  onError?: (event: { nativeEvent: { message: string } }) => void;
  onPlayingChange?: (event: { nativeEvent: { isPlaying: boolean } }) => void;
  onBufferingChange?: (event: {
    nativeEvent: { isBuffering: boolean };
  }) => void;
  onBackgroundAudioChange?: (event: {
    nativeEvent: { enabled: boolean };
  }) => void;
  /** Fires every ~1 s while playing. position/duration are milliseconds. */
  onPositionChange?: (event: {
    nativeEvent: { position: number; duration: number };
  }) => void;
}

// ── Native view ───────────────────────────────────────────────────────────────

const NativeTvPlayerView =
  Platform.OS === "android" ? requireNativeViewManager("TvPlayer") : null;

// ── Imperative commands ───────────────────────────────────────────────────────
// AsyncFunction definitions inside the View block are automatically attached
// to the React ref. Call them via ref.current directly.

export const TvPlayerCommands = {
  loadSource: (
    viewRef: React.RefObject<any>,
    params: TvPlayerLoadParams,
  ): Promise<void> | undefined => viewRef.current?.loadSource(params),

  play: (viewRef: React.RefObject<any>): Promise<void> | undefined =>
    viewRef.current?.play(),

  pause: (viewRef: React.RefObject<any>): Promise<void> | undefined =>
    viewRef.current?.pause(),

  seekTo: (
    viewRef: React.RefObject<any>,
    positionMs: number,
  ): Promise<void> | undefined => viewRef.current?.seekTo(positionMs),

  setVolume: (
    viewRef: React.RefObject<any>,
    volume: number,
  ): Promise<void> | undefined => viewRef.current?.setVolume(volume),

  release: (viewRef: React.RefObject<any>): Promise<void> | undefined =>
    viewRef.current?.release(),

  getCurrentPosition: (
    viewRef: React.RefObject<any>,
  ): Promise<number> | undefined => viewRef.current?.getCurrentPosition(),

  getDuration: (viewRef: React.RefObject<any>): Promise<number> | undefined =>
    viewRef.current?.getDuration(),

  isPlaying: (viewRef: React.RefObject<any>): Promise<boolean> | undefined =>
    viewRef.current?.isPlaying(),

  enableBackgroundAudio: (
    viewRef: React.RefObject<any>,
  ): Promise<void> | undefined => viewRef.current?.enableBackgroundAudio(),

  disableBackgroundAudio: (
    viewRef: React.RefObject<any>,
  ): Promise<void> | undefined => viewRef.current?.disableBackgroundAudio(),

  isBackgroundAudioEnabled: (
    viewRef: React.RefObject<any>,
  ): Promise<boolean> | undefined =>
    viewRef.current?.isBackgroundAudioEnabled(),
};

// ── React component ───────────────────────────────────────────────────────────

export const TvPlayerView = React.forwardRef<any, TvPlayerViewProps>(
  (props, ref) => {
    if (!NativeTvPlayerView) return null;
    return React.createElement(NativeTvPlayerView, { ...props, ref });
  },
);

TvPlayerView.displayName = "TvPlayerView";
