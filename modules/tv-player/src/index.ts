import {
  requireNativeViewManager,
  requireOptionalNativeModule,
  Platform,
} from "expo-modules-core";
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

export interface NativeAudioTrack {
  groupIndex: number;
  trackIndex: number;
  id: string;
  label: string;
  language: string;
  isSelected: boolean;
}

export interface NativeSubtitleTrack {
  groupIndex: number;
  trackIndex: number;
  id: string;
  label: string;
  language: string;
  isSelected: boolean;
}

export interface MediaMetadataParams {
  title: string;
  artist?: string;
  artworkUri?: string;
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
  /** Fires when available audio/subtitle tracks change (after load). */
  onTracksChange?: (event: {
    nativeEvent: {
      audioTracks: NativeAudioTrack[];
      subtitleTracks: NativeSubtitleTrack[];
    };
  }) => void;
  /** Fires when the app enters or exits Picture-in-Picture mode. */
  onPipModeChange?: (event: { nativeEvent: { isInPiP: boolean } }) => void;
}

// ── Native view ───────────────────────────────────────────────────────────────

const NativeTvPlayerView =
  Platform.OS === "android" ? requireNativeViewManager("TvPlayer") : null;

// Module-level functions (not tied to a view instance)
const TvPlayerModule =
  Platform.OS === "android"
    ? requireOptionalNativeModule<{
        fetchPlaylist(url: string): Promise<{
          success: boolean;
          error: string;
          content: string;
        }>;
      }>("TvPlayer")
    : null;

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

  /** "contain" | "cover" | "fill" — maps to RESIZE_MODE_FIT/ZOOM/FILL */
  setResizeMode: (
    viewRef: React.RefObject<any>,
    mode: "contain" | "cover" | "fill",
  ): Promise<void> | undefined => viewRef.current?.setResizeMode(mode),

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

  selectAudioTrack: (
    viewRef: React.RefObject<any>,
    groupIndex: number,
    trackIndex: number,
  ): Promise<void> | undefined =>
    viewRef.current?.selectAudioTrack(groupIndex, trackIndex),

  selectSubtitleTrack: (
    viewRef: React.RefObject<any>,
    groupIndex: number,
    trackIndex: number,
  ): Promise<void> | undefined =>
    viewRef.current?.selectSubtitleTrack(groupIndex, trackIndex),

  /** Enter Picture-in-Picture mode (mobile only, no-op on TV). */
  enterPip: (viewRef: React.RefObject<any>): Promise<void> | undefined =>
    viewRef.current?.enterPip(),

  /** Set media metadata for the system notification and Now Playing controls. */
  setMediaMetadata: (
    viewRef: React.RefObject<any>,
    params: { title: string; artist?: string; artworkUri?: string },
  ): Promise<void> | undefined => viewRef.current?.setMediaMetadata(params),
};

// ── React component ───────────────────────────────────────────────────────────

export const TvPlayerView = React.forwardRef<any, TvPlayerViewProps>(
  (props, ref) => {
    if (!NativeTvPlayerView) return null;
    return React.createElement(NativeTvPlayerView, { ...props, ref });
  },
);

TvPlayerView.displayName = "TvPlayerView";

// ── Module-level functions ────────────────────────────────────────────────────

/**
 * Fetches playlist content using native OkHttp (bypasses RN fetch limitations
 * with User-Agent headers on Android). Returns { success, error, content }.
 */
export async function fetchPlaylistNative(
  url: string,
): Promise<{ success: boolean; error: string; content: string }> {
  if (!TvPlayerModule) {
    return {
      success: false,
      error: "Native module not available",
      content: "",
    };
  }
  return TvPlayerModule.fetchPlaylist(url);
}
