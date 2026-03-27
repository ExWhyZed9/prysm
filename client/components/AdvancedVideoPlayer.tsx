import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  Platform,
  ViewStyle,
  StatusBar,
  PermissionsAndroid,
  findNodeHandle,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { parseHLSQualities, isHLSStream } from "@/lib/hls-quality-parser";
import { Channel } from "@/types/playlist";
import {
  TvPlayerView,
  TvPlayerCommands,
} from "../../modules/tv-player/src/index";

const isTV = Platform.isTV;

// ── Constants ────────────────────────────────────────────────────────────────

const SEEK_MS = 10_000;
// On TV controls stay visible until the user presses Back/Menu to hide them.
// On phone/tablet they auto-hide after CONTROLS_TIMEOUT_MS of inactivity.
const CONTROLS_TIMEOUT_MS = 4_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── TVFocusablePressable ──────────────────────────────────────────────────────

function TVFocusablePressable({
  onPress,
  baseStyle,
  focusedStyle,
  children,
  hitSlop,
  focusable = true,
  hasTVPreferredFocus,
  accessibilityLabel,
  accessibilityRole = "button" as const,
  viewRef,
  nextFocusUp,
  nextFocusDown,
  nextFocusLeft,
  nextFocusRight,
}: {
  onPress: () => void;
  baseStyle: any;
  focusedStyle: ViewStyle;
  children: React.ReactNode;
  hitSlop?: number;
  focusable?: boolean;
  hasTVPreferredFocus?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  viewRef?: React.RefObject<any>;
  nextFocusUp?: number | null;
  nextFocusDown?: number | null;
  nextFocusLeft?: number | null;
  nextFocusRight?: number | null;
}) {
  const [focused, setFocused] = useState(false);
  const tvProps: any = {};
  if (hasTVPreferredFocus) tvProps.hasTVPreferredFocus = true;
  if (nextFocusUp != null) tvProps.nextFocusUp = nextFocusUp;
  if (nextFocusDown != null) tvProps.nextFocusDown = nextFocusDown;
  if (nextFocusLeft != null) tvProps.nextFocusLeft = nextFocusLeft;
  if (nextFocusRight != null) tvProps.nextFocusRight = nextFocusRight;
  const base = Array.isArray(baseStyle) ? baseStyle : [baseStyle];
  return (
    <Pressable
      ref={viewRef}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      focusable={focusable}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      hitSlop={hitSlop}
      {...tvProps}
      style={[...base, focused && focusedStyle] as ViewStyle[]}
    >
      {children}
    </Pressable>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DRMConfig {
  type: "widevine" | "fairplay" | "playready" | "clearkey";
  licenseServer: string;
  headers?: Record<string, string>;
  certificateUrl?: string;
}

export interface VideoQuality {
  label: string;
  resolution: string;
  bitrate?: number;
  url?: string;
}

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
  isDefault?: boolean;
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  url?: string;
}

export interface AdvancedVideoPlayerProps {
  source: string;
  title?: string;
  subtitle?: string;
  poster?: string;
  autoPlay?: boolean;
  drm?: DRMConfig;
  headers?: Record<string, string>;
  qualities?: VideoQuality[];
  audioTracks?: AudioTrack[];
  subtitleTracks?: SubtitleTrack[];
  recentChannels?: Channel[];
  onError?: (error: string) => void;
  onBack?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onChannelSelect?: (channelId: string) => void;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
  isLive?: boolean;
}

type ContentFit = "contain" | "cover" | "fill";
const CONTENT_FIT_OPTIONS: {
  label: string;
  icon: string;
  value: ContentFit;
}[] = [
  { label: "Fit", icon: "scan-outline", value: "contain" },
  { label: "Fill", icon: "expand-outline", value: "cover" },
  { label: "Stretch", icon: "resize-outline", value: "fill" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const AdvancedVideoPlayer = React.memo(function AdvancedVideoPlayer({
  source,
  title,
  subtitle,
  poster,
  autoPlay = true,
  headers,
  drm,
  qualities: propQualities = [],
  audioTracks: propAudioTracks = [],
  subtitleTracks: propSubtitleTracks = [],
  recentChannels = [],
  onError,
  onBack,
  onNext,
  onPrevious,
  onChannelSelect,
  isFavorite,
  onFavoritePress,
  isLive = true,
}: AdvancedVideoPlayerProps) {
  useKeepAwake();

  const insets = useSafeAreaInsets();
  const { playerControls, isUltraWide, width } = useResponsive();

  // ── Refs ─────────────────────────────────────────────────────────────────
  const tvPlayerRef = useRef<any>(null);
  // Track whether the native view has mounted and is ready to receive commands
  const nativeReadyRef = useRef(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror of showControls — always in sync, read by TVEventHandler closure
  const showControlsRef = useRef(false);
  // Ref mirror of isBackgroundPlaying — read by TVEventHandler closure
  const isBackgroundPlayingRef = useRef(false);

  // TV focus routing — refs for nextFocus wiring between the three control rows
  const backBtnRef = useRef<any>(null);
  const playPauseBtnRef = useRef<any>(null);
  const seekBarRef = useRef<any>(null);
  const firstToolBtnRef = useRef<any>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  // Controls always start hidden. On TV they appear on the first OK press.
  // On phone they appear on the first tap.
  const [showControls, setShowControlsState] = useState(false);
  const [seekBarFocused, setSeekBarFocused] = useState(false);
  // Node handles for nextFocus wiring — populated after first layout
  const [nh, setNh] = useState<{
    backBtn: number | null;
    playPause: number | null;
    seekBar: number | null;
    firstTool: number | null;
  }>({ backBtn: null, playPause: null, seekBar: null, firstTool: null });
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isBackgroundPlaying, setIsBackgroundPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [contentFit, setContentFit] = useState<ContentFit>("contain");
  const [currentSource, setCurrentSource] = useState(source);
  const [detectedQualities, setDetectedQualities] = useState<VideoQuality[]>(
    [],
  );
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<string | null>(
    null,
  );
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<
    string | null
  >(null);
  const [showRecentPanel, setShowRecentPanel] = useState(false);

  // Modals
  const [showStopAudioModal, setShowStopAudioModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [showAspectModal, setShowAspectModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);

  // Seek flash
  const [seekFlash, setSeekFlash] = useState<{
    visible: boolean;
    dir: "backward" | "forward";
  }>({ visible: false, dir: "forward" });

  const qualities =
    detectedQualities.length > 0 ? detectedQualities : propQualities;

  // ── Animations ────────────────────────────────────────────────────────────
  const controlsOpacity = useSharedValue(0);
  const recentTranslateX = useSharedValue(280);
  const seekFlashOpacity = useSharedValue(0);
  const lockOpacity = useSharedValue(0);

  const animControls = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));
  const animRecent = useAnimatedStyle(() => ({
    transform: [{ translateX: recentTranslateX.value }],
  }));
  const animSeekFlash = useAnimatedStyle(() => ({
    opacity: seekFlashOpacity.value,
  }));
  const animLock = useAnimatedStyle(() => ({ opacity: lockOpacity.value }));

  // ── Controls show/hide ────────────────────────────────────────────────────

  // Single source of truth for setting controls visibility.
  // Drives both the state (for conditional rendering / focusability) and animation.
  const setShowControls = useCallback(
    (visible: boolean) => {
      showControlsRef.current = visible;
      setShowControlsState(visible);
      controlsOpacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
    },
    [controlsOpacity],
  );

  // Start/reset the auto-hide timer (phone only — on TV controls stay until dismissed).
  const scheduleHide = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isTV) return; // TV: controls stay visible, dismissed via Back/Menu
    controlsTimerRef.current = setTimeout(() => {
      // Don't hide while a modal is open or while paused
      if (
        showSettingsModal ||
        showQualityModal ||
        showAspectModal ||
        showAudioModal ||
        showSubtitleModal
      )
        return;
      setShowControls(false);
    }, CONTROLS_TIMEOUT_MS);
  }, [
    showSettingsModal,
    showQualityModal,
    showAspectModal,
    showAudioModal,
    showSubtitleModal,
    setShowControls,
  ]);

  const showAndScheduleHide = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [setShowControls, scheduleHide]);

  // Keep ref up-to-date so the TVEventHandler closure can read it without
  // needing to be recreated on every render.
  const scheduleHideRef = useRef(scheduleHide);
  const showAndScheduleHideRef = useRef(showAndScheduleHide);
  useEffect(() => {
    scheduleHideRef.current = scheduleHide;
  }, [scheduleHide]);
  useEffect(() => {
    showAndScheduleHideRef.current = showAndScheduleHide;
  }, [showAndScheduleHide]);

  // ── TV nextFocus node handles ─────────────────────────────────────────────
  // Computed once after the controls first become visible so the refs are
  // attached. Allows Android TV to follow a predictable D-pad order:
  //   Top row  →  Center row (play/pause)  →  Bottom row (seek bar / tools)
  useEffect(() => {
    if (!isTV || !showControls) return;
    // Small delay so the Pressable refs are attached after the animated fade-in
    const t = setTimeout(() => {
      setNh({
        backBtn: findNodeHandle(backBtnRef.current),
        playPause: findNodeHandle(playPauseBtnRef.current),
        seekBar: findNodeHandle(seekBarRef.current),
        firstTool: findNodeHandle(firstToolBtnRef.current),
      });
    }, 250);
    return () => clearTimeout(t);
  }, [showControls]);

  // ── Source change ─────────────────────────────────────────────────────────

  // When the parent changes the source URL (channel switch), propagate it.
  useEffect(() => {
    setCurrentSource(source);
  }, [source]);

  // ── HLS quality detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentSource || !isHLSStream(currentSource)) return;
    parseHLSQualities(currentSource)
      .then((q) => {
        if (q.length > 0) setDetectedQualities(q);
      })
      .catch(() => {});
  }, [currentSource]);

  // ── Native player load ────────────────────────────────────────────────────
  const loadSource = useCallback(() => {
    if (!tvPlayerRef.current) return;
    setIsLoading(true);
    setError(null);
    TvPlayerCommands.loadSource(tvPlayerRef, {
      url: currentSource,
      headers: headers && Object.keys(headers).length > 0 ? headers : undefined,
      drmType: drm?.type as any,
      drmLicenseUrl: drm?.licenseServer,
      drmHeaders: drm?.headers,
      autoPlay,
    });
  }, [currentSource, headers, drm, autoPlay]);

  // Run loadSource whenever these values change, but guard on native readiness.
  useEffect(() => {
    if (nativeReadyRef.current) {
      loadSource();
    }
    // nativeReadyRef is not reactive — intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSource, headers, drm, autoPlay]);

  // Native view callback ref — fires when the native view mounts.
  const nativeViewRef = useCallback((node: any) => {
    (tvPlayerRef as React.MutableRefObject<any>).current = node;
    if (node && !nativeReadyRef.current) {
      // The native view just mounted; trigger initial load.
      nativeReadyRef.current = true;
      // Slight delay to let the native view fully initialise its surface.
      setTimeout(() => loadSource(), 50);
    }
    // loadSource is stable (useCallback) — safe to include
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release on unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      TvPlayerCommands.release(tvPlayerRef);
    };
  }, []);

  // ── TV D-pad handler ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTV) return;
    let handler: any = null;
    try {
      const RN = require("react-native");
      const TVHandler = RN.TVEventHandler;
      if (!TVHandler) return;
      handler = new TVHandler();
      handler.enable({} as any, (_: any, evt: any) => {
        if (!evt) return;
        const { eventType } = evt;

        if (["up", "down", "left", "right", "playPause"].includes(eventType)) {
          // Directional / play-pause keys always show controls and reset timer
          if (!showControlsRef.current) {
            showAndScheduleHideRef.current();
          } else {
            scheduleHideRef.current();
          }
        } else if (eventType === "select") {
          // OK button: if controls are hidden, show them (video keeps playing).
          // Focus lands on Play/Pause automatically via hasTVPreferredFocus,
          // so the next OK press will pause/resume via that button's onPress.
          // If controls are already visible, the focused button handles the
          // press itself — we just reset the hide timer here.
          if (!showControlsRef.current) {
            showAndScheduleHideRef.current();
          } else {
            scheduleHideRef.current();
          }
        } else if (eventType === "menu" || eventType === "back") {
          if (showControlsRef.current) {
            showControlsRef.current = false;
            setShowControlsState(false);
            controlsOpacity.value = withTiming(0, { duration: 200 });
            setShowRecentPanel(false);
          } else if (isBackgroundPlayingRef.current) {
            // Background audio is on — ask the user whether to stop it or keep
            // it playing before navigating away.
            setShowStopAudioModal(true);
          } else {
            // Controls already hidden — treat as a navigation back
            onBack?.();
          }
        }
      });
    } catch (_) {}
    return () => {
      try {
        handler?.disable();
      } catch (_) {}
    };
    // onBack is stable from the parent; controlsOpacity is a shared value (stable ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBack]);

  // ── Playback actions ──────────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      TvPlayerCommands.pause(tvPlayerRef);
    } else {
      TvPlayerCommands.play(tvPlayerRef);
    }
    scheduleHideRef.current();
  }, [isPlaying]);

  const handleSeek = useCallback(
    (offsetMs: number) => {
      if (isLive) return;
      if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newPos = Math.max(0, Math.min(positionMs + offsetMs, durationMs));
      TvPlayerCommands.seekTo(tvPlayerRef, newPos);
      scheduleHideRef.current();
    },
    [positionMs, durationMs, isLive],
  );

  const handleSeekToPercent = useCallback(
    (pct: number) => {
      if (isLive || durationMs <= 0) return;
      TvPlayerCommands.seekTo(tvPlayerRef, Math.floor(pct * durationMs));
      scheduleHideRef.current();
    },
    [durationMs, isLive],
  );

  const handleQualitySelect = useCallback(
    (q: VideoQuality | "auto") => {
      if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (q === "auto") {
        setSelectedQuality("auto");
        setCurrentSource(source);
      } else {
        setSelectedQuality(q.label);
        if (q.url) setCurrentSource(q.url);
      }
      setShowQualityModal(false);
      scheduleHideRef.current();
    },
    [source],
  );

  const handleBackgroundToggle = useCallback(async () => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isBackgroundPlaying) {
      TvPlayerCommands.disableBackgroundAudio(tvPlayerRef);
    } else {
      if (
        Platform.OS === "android" &&
        parseInt(String(Platform.Version), 10) >= 33
      ) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      TvPlayerCommands.enableBackgroundAudio(tvPlayerRef);
    }
    scheduleHideRef.current();
  }, [isBackgroundPlaying]);

  // ── Channel navigation ────────────────────────────────────────────────────
  // Stop background audio before switching channels so the old stream doesn't
  // keep playing while the new PlayerScreen mounts and starts a fresh player.
  const navigateToChannel = useCallback((fn?: () => void) => {
    if (isBackgroundPlayingRef.current) {
      TvPlayerCommands.disableBackgroundAudio(tvPlayerRef);
    }
    fn?.();
  }, []);

  // ── Animations: panels ────────────────────────────────────────────────────

  useEffect(() => {
    recentTranslateX.value = withSpring(showRecentPanel ? 0 : 280, {
      damping: 20,
    });
  }, [showRecentPanel, recentTranslateX]);

  useEffect(() => {
    lockOpacity.value = withTiming(isLocked ? 1 : 0, { duration: 150 });
  }, [isLocked, lockOpacity]);

  // ── Gestures ──────────────────────────────────────────────────────────────

  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(showControlsRef.current ? scheduleHide : showAndScheduleHide)();
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((evt) => {
      if (isLive) return;
      const dir = evt.x < width / 2 ? "backward" : "forward";
      runOnJS(handleSeek)(dir === "backward" ? -SEEK_MS : SEEK_MS);
      if (!isTV)
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      runOnJS(setSeekFlash)({ visible: true, dir });
      seekFlashOpacity.value = withTiming(1, { duration: 80 }, () => {
        seekFlashOpacity.value = withTiming(0, { duration: 400 }, () => {
          runOnJS(setSeekFlash)({ visible: false, dir });
        });
      });
    });

  const composedGesture = Gesture.Exclusive(doubleTapGesture, tapGesture);

  // ── Derived ───────────────────────────────────────────────────────────────
  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const displayedRecent = recentChannels.slice(0, 5);

  const currentAspectLabel = useMemo(
    () =>
      CONTENT_FIT_OPTIONS.find((o) => o.value === contentFit)?.label ?? "Fit",
    [contentFit],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={st.root}>
      <StatusBar hidden />

      {/* ── Video surface ───────────────────────────────────────────── */}
      <GestureDetector gesture={composedGesture}>
        <View style={st.videoWrap}>
          <TvPlayerView
            ref={nativeViewRef}
            style={st.video as any}
            onReady={() => {
              setIsLoading(false);
              setIsBuffering(false);
              setError(null);
            }}
            onError={(e) => {
              const msg = e.nativeEvent.message || "Stream failed to load";
              setIsLoading(false);
              setIsBuffering(false);
              setError(msg);
              onError?.(msg);
            }}
            onPlayingChange={(e) => setIsPlaying(e.nativeEvent.isPlaying)}
            onBufferingChange={(e) => {
              setIsBuffering(e.nativeEvent.isBuffering);
              if (e.nativeEvent.isBuffering) setIsLoading(false);
            }}
            onBackgroundAudioChange={(e) => {
              isBackgroundPlayingRef.current = e.nativeEvent.enabled;
              setIsBackgroundPlaying(e.nativeEvent.enabled);
            }}
            onPositionChange={(e) => {
              setPositionMs(e.nativeEvent.position);
              setDurationMs(e.nativeEvent.duration);
            }}
          />

          {/* Loading / buffering spinner */}
          {(isLoading || isBuffering) && !error ? (
            <View style={st.centerOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={Colors.dark.primary} />
              <ThemedText type="small" style={st.loadingText}>
                {isLoading ? "Loading stream…" : "Buffering…"}
              </ThemedText>
            </View>
          ) : null}

          {/* Error state */}
          {error ? (
            <View style={st.centerOverlay}>
              <View style={st.errorBox}>
                <Ionicons
                  name="cloud-offline"
                  size={52}
                  color={Colors.dark.error}
                />
                <ThemedText type="body" style={st.errorText}>
                  {error}
                </ThemedText>
                <TVFocusablePressable
                  onPress={() => {
                    setError(null);
                    setIsLoading(true);
                    loadSource();
                  }}
                  baseStyle={st.retryBtn}
                  focusedStyle={st.retryBtnFocused}
                  hasTVPreferredFocus={isTV}
                  accessibilityLabel="Retry"
                >
                  <Ionicons
                    name="refresh"
                    size={18}
                    color={Colors.dark.primary}
                  />
                  <ThemedText
                    type="small"
                    style={{ color: Colors.dark.primary, marginLeft: 6 }}
                  >
                    Retry
                  </ThemedText>
                </TVFocusablePressable>
              </View>
            </View>
          ) : null}

          {/* Seek flash */}
          {seekFlash.visible ? (
            <Animated.View
              style={[
                st.seekFlash,
                seekFlash.dir === "backward"
                  ? st.seekFlashLeft
                  : st.seekFlashRight,
                animSeekFlash,
              ]}
              pointerEvents="none"
            >
              <Ionicons
                name={
                  seekFlash.dir === "backward" ? "play-back" : "play-forward"
                }
                size={36}
                color="#fff"
              />
              <ThemedText type="small" style={st.seekFlashText}>
                {SEEK_MS / 1000}s
              </ThemedText>
            </Animated.View>
          ) : null}

          {/* Lock overlay */}
          {isLocked ? (
            <Animated.View style={[st.lockOverlay, animLock]}>
              <View style={st.lockBox}>
                <Ionicons name="lock-closed" size={28} color="#fff" />
                <ThemedText type="body" style={{ color: "#fff", marginTop: 8 }}>
                  Controls locked
                </ThemedText>
                <Pressable
                  onPress={() => setIsLocked(false)}
                  style={st.unlockBtn}
                  hitSlop={16}
                >
                  <ThemedText
                    type="small"
                    style={{ color: Colors.dark.primary }}
                  >
                    Tap to unlock
                  </ThemedText>
                </Pressable>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {/* ── Controls overlay ────────────────────────────────────────── */}
      {/*
          Always rendered (so animations work) but pointer-events are "none"
          when hidden so touches pass through to the gesture detector below.
          On TV, all TVFocusablePressable children are only focusable when
          showControls is true, preventing focus from landing on invisible buttons.
        */}
      <Animated.View
        style={[st.controlsOverlay, animControls]}
        pointerEvents={showControls && !isLocked ? "box-none" : "none"}
      >
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <View
          style={[
            st.topBar,
            {
              paddingTop: insets.top + Spacing.sm,
              paddingLeft: insets.left + Spacing.md,
              paddingRight: insets.right + Spacing.md,
            },
          ]}
        >
          {/* Back */}
          <View style={st.topLeft}>
            {onBack ? (
              <TVFocusablePressable
                onPress={onBack}
                baseStyle={st.iconBtn}
                focusedStyle={st.iconBtnFocused}
                focusable={showControls}
                hitSlop={16}
                accessibilityLabel="Back"
                viewRef={backBtnRef}
                nextFocusDown={nh.playPause}
              >
                <Ionicons
                  name="chevron-back"
                  size={playerControls.icon + 4}
                  color="#fff"
                />
              </TVFocusablePressable>
            ) : null}
          </View>

          {/* Title */}
          <View style={st.topCenter}>
            {title ? (
              <ThemedText
                type={isUltraWide ? "body" : "h4"}
                style={st.titleText}
                numberOfLines={1}
              >
                {title}
              </ThemedText>
            ) : null}
            {subtitle ? (
              <ThemedText
                type="small"
                style={st.subtitleText}
                numberOfLines={1}
              >
                {subtitle}
              </ThemedText>
            ) : null}
          </View>

          {/* Top-right actions */}
          <View style={st.topRight}>
            {/* Recent channels */}
            {recentChannels.length > 0 ? (
              <TVFocusablePressable
                onPress={() => setShowRecentPanel((p) => !p)}
                baseStyle={st.iconBtn}
                focusedStyle={st.iconBtnFocused}
                focusable={showControls}
                accessibilityLabel="Recent channels"
              >
                <Ionicons name="list" size={playerControls.icon} color="#fff" />
              </TVFocusablePressable>
            ) : null}

            {/* Favourite */}
            {onFavoritePress ? (
              <TVFocusablePressable
                onPress={onFavoritePress}
                baseStyle={[st.iconBtn, isFavorite && st.iconBtnActive]}
                focusedStyle={st.iconBtnFocused}
                focusable={showControls}
                accessibilityLabel={
                  isFavorite ? "Remove favourite" : "Add favourite"
                }
              >
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={playerControls.icon}
                  color={isFavorite ? Colors.dark.primary : "#fff"}
                />
              </TVFocusablePressable>
            ) : null}

            {/* Lock */}
            {!isTV ? (
              <TVFocusablePressable
                onPress={() => setIsLocked(true)}
                baseStyle={st.iconBtn}
                focusedStyle={st.iconBtnFocused}
                focusable={showControls}
                accessibilityLabel="Lock controls"
              >
                <Ionicons
                  name="lock-open-outline"
                  size={playerControls.icon}
                  color="#fff"
                />
              </TVFocusablePressable>
            ) : null}
          </View>
        </View>

        {/* ── Center transport ─────────────────────────────────────── */}
        <View style={st.centerRow}>
          {/* Previous / seek-back */}
          {onPrevious ? (
            <TVFocusablePressable
              onPress={() => navigateToChannel(onPrevious)}
              baseStyle={[
                st.navBtn,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={st.navBtnFocused}
              focusable={showControls}
              hitSlop={12}
              accessibilityLabel="Previous"
            >
              <Ionicons
                name="play-skip-back"
                size={playerControls.icon * 1.2}
                color="#fff"
              />
            </TVFocusablePressable>
          ) : !isLive ? (
            <TVFocusablePressable
              onPress={() => handleSeek(-SEEK_MS)}
              baseStyle={[
                st.navBtn,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={st.navBtnFocused}
              focusable={showControls}
              hitSlop={12}
              accessibilityLabel="Seek back 10s"
            >
              <Ionicons
                name="play-back"
                size={playerControls.icon * 1.2}
                color="#fff"
              />
            </TVFocusablePressable>
          ) : (
            <View
              style={{ width: playerControls.nav, height: playerControls.nav }}
            />
          )}

          {/* Play / Pause — always preferred focus on TV when controls are visible */}
          <TVFocusablePressable
            onPress={handlePlayPause}
            baseStyle={[
              st.playBtn,
              {
                width: playerControls.play,
                height: playerControls.play,
                borderRadius: playerControls.play / 2,
              },
            ]}
            focusedStyle={st.playBtnFocused}
            focusable={showControls}
            hasTVPreferredFocus={isTV && showControls}
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
            viewRef={playPauseBtnRef}
            nextFocusUp={nh.backBtn}
            nextFocusDown={nh.seekBar ?? nh.firstTool}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={playerControls.icon * 1.8}
              color="#fff"
            />
          </TVFocusablePressable>

          {/* Next / seek-forward */}
          {onNext ? (
            <TVFocusablePressable
              onPress={() => navigateToChannel(onNext)}
              baseStyle={[
                st.navBtn,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={st.navBtnFocused}
              focusable={showControls}
              hitSlop={12}
              accessibilityLabel="Next"
            >
              <Ionicons
                name="play-skip-forward"
                size={playerControls.icon * 1.2}
                color="#fff"
              />
            </TVFocusablePressable>
          ) : !isLive ? (
            <TVFocusablePressable
              onPress={() => handleSeek(SEEK_MS)}
              baseStyle={[
                st.navBtn,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={st.navBtnFocused}
              focusable={showControls}
              hitSlop={12}
              accessibilityLabel="Seek forward 10s"
            >
              <Ionicons
                name="play-forward"
                size={playerControls.icon * 1.2}
                color="#fff"
              />
            </TVFocusablePressable>
          ) : (
            <View
              style={{ width: playerControls.nav, height: playerControls.nav }}
            />
          )}
        </View>

        {/* ── Bottom bar ───────────────────────────────────────────── */}
        <View
          style={[
            st.bottomBar,
            {
              paddingBottom: insets.bottom + Spacing.md,
              paddingLeft: insets.left + Spacing.md,
              paddingRight: insets.right + Spacing.md,
            },
          ]}
        >
          {/* Progress row — VOD only */}
          {!isLive ? (
            <View style={st.progressRow}>
              <ThemedText type="caption" style={st.timeText}>
                {formatTime(positionMs)}
              </ThemedText>
              <Pressable
                ref={seekBarRef}
                style={[st.seekBar, seekBarFocused && st.seekBarFocused]}
                focusable={showControls}
                onFocus={() => setSeekBarFocused(true)}
                onBlur={() => setSeekBarFocused(false)}
                nextFocusUp={nh.playPause ?? undefined}
                nextFocusDown={nh.firstTool ?? undefined}
                onPress={(e) => {
                  const barWidth =
                    width -
                    insets.left -
                    insets.right -
                    Spacing.md * 2 -
                    48 * 2;
                  handleSeekToPercent(
                    Math.min(
                      1,
                      Math.max(0, e.nativeEvent.locationX / barWidth),
                    ),
                  );
                }}
              >
                <View
                  style={[
                    st.seekBarTrack,
                    seekBarFocused && st.seekBarTrackFocused,
                  ]}
                >
                  <View
                    style={[st.seekBarFill, { width: `${progress * 100}%` }]}
                  />
                  <View
                    style={[
                      st.seekThumb,
                      { left: `${progress * 100}%` },
                      seekBarFocused && st.seekThumbFocused,
                    ]}
                  />
                </View>
              </Pressable>
              <ThemedText type="caption" style={st.timeText}>
                {formatTime(durationMs)}
              </ThemedText>
            </View>
          ) : null}

          {/* Bottom controls row */}
          <View style={st.bottomRow}>
            {/* Left badges */}
            <View style={st.badgeRow}>
              {isLive ? (
                <View style={st.liveBadge}>
                  <View style={st.liveDot} />
                  <ThemedText type="small" style={st.liveText}>
                    LIVE
                  </ThemedText>
                </View>
              ) : null}
              {drm ? (
                <View style={st.drmBadge}>
                  <Ionicons
                    name="shield-checkmark"
                    size={12}
                    color={Colors.dark.success}
                  />
                  <ThemedText
                    type="caption"
                    style={{ color: "#fff", marginLeft: 4 }}
                  >
                    DRM
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {/* Right tool buttons */}
            <View style={st.bottomRight}>
              {/* Background audio */}
              <TVFocusablePressable
                onPress={handleBackgroundToggle}
                baseStyle={[
                  st.toolBtn,
                  isBackgroundPlaying && st.toolBtnActive,
                ]}
                focusedStyle={st.toolBtnFocused}
                focusable={showControls}
                accessibilityLabel={
                  isBackgroundPlaying
                    ? "Disable background audio"
                    : "Enable background audio"
                }
                viewRef={firstToolBtnRef}
                nextFocusUp={nh.seekBar ?? nh.playPause}
              >
                <Ionicons
                  name={
                    isBackgroundPlaying
                      ? "musical-notes"
                      : "musical-notes-outline"
                  }
                  size={20}
                  color={isBackgroundPlaying ? Colors.dark.primary : "#fff"}
                />
              </TVFocusablePressable>

              {/* Aspect ratio */}
              <TVFocusablePressable
                onPress={() => setShowAspectModal(true)}
                baseStyle={st.toolBtn}
                focusedStyle={st.toolBtnFocused}
                focusable={showControls}
                accessibilityLabel="Aspect ratio"
              >
                <Ionicons name="scan-outline" size={20} color="#fff" />
              </TVFocusablePressable>

              {/* Subtitles */}
              {propSubtitleTracks.length > 0 ? (
                <TVFocusablePressable
                  onPress={() => setShowSubtitleModal(true)}
                  baseStyle={[
                    st.toolBtn,
                    selectedSubtitleTrack !== null && st.toolBtnActive,
                  ]}
                  focusedStyle={st.toolBtnFocused}
                  focusable={showControls}
                  accessibilityLabel="Subtitles"
                >
                  <Ionicons
                    name="text"
                    size={20}
                    color={
                      selectedSubtitleTrack !== null
                        ? Colors.dark.primary
                        : "#fff"
                    }
                  />
                </TVFocusablePressable>
              ) : null}

              {/* Audio */}
              {propAudioTracks.length > 0 ? (
                <TVFocusablePressable
                  onPress={() => setShowAudioModal(true)}
                  baseStyle={st.toolBtn}
                  focusedStyle={st.toolBtnFocused}
                  focusable={showControls}
                  accessibilityLabel="Audio track"
                >
                  <Ionicons
                    name="volume-medium-outline"
                    size={20}
                    color="#fff"
                  />
                </TVFocusablePressable>
              ) : null}

              {/* Quality */}
              {qualities.length > 0 ? (
                <TVFocusablePressable
                  onPress={() => setShowQualityModal(true)}
                  baseStyle={st.toolBtn}
                  focusedStyle={st.toolBtnFocused}
                  focusable={showControls}
                  accessibilityLabel="Quality"
                >
                  <Ionicons name="layers-outline" size={20} color="#fff" />
                </TVFocusablePressable>
              ) : null}

              {/* Settings */}
              <TVFocusablePressable
                onPress={() => setShowSettingsModal(true)}
                baseStyle={st.toolBtn}
                focusedStyle={st.toolBtnFocused}
                focusable={showControls}
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </TVFocusablePressable>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── Recent channels slide-panel ──────────────────────────── */}
      <Animated.View
        style={[
          st.recentPanel,
          animRecent,
          { paddingTop: insets.top, paddingRight: insets.right },
        ]}
        pointerEvents={showRecentPanel ? "box-none" : "none"}
      >
        <View style={st.recentHeader}>
          <ThemedText type="h4" style={{ color: "#fff" }}>
            Recent
          </ThemedText>
          <TVFocusablePressable
            onPress={() => setShowRecentPanel(false)}
            baseStyle={st.iconBtn}
            focusedStyle={st.iconBtnFocused}
            hitSlop={16}
            accessibilityLabel="Close recent channels"
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TVFocusablePressable>
        </View>
        <ScrollView>
          {displayedRecent.map((ch) => (
            <TVFocusablePressable
              key={ch.id}
              onPress={() => {
                navigateToChannel(() => onChannelSelect?.(ch.id));
                setShowRecentPanel(false);
              }}
              baseStyle={st.recentItem}
              focusedStyle={st.recentItemFocused}
              accessibilityLabel={ch.name}
            >
              {ch.logo ? (
                <Image
                  source={{ uri: ch.logo }}
                  style={st.recentLogo}
                  contentFit="contain"
                />
              ) : (
                <View style={[st.recentLogo, st.recentLogoPlaceholder]}>
                  <Ionicons
                    name="tv-outline"
                    size={20}
                    color={Colors.dark.textSecondary}
                  />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <ThemedText
                  type="body"
                  style={{ color: "#fff" }}
                  numberOfLines={1}
                >
                  {ch.name}
                </ThemedText>
                <ThemedText
                  type="caption"
                  style={{ color: Colors.dark.textSecondary }}
                  numberOfLines={1}
                >
                  {ch.group}
                </ThemedText>
              </View>
            </TVFocusablePressable>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── Stop background audio confirmation (TV only) ────────────── */}
      <Modal
        visible={showStopAudioModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStopAudioModal(false)}
      >
        <View style={st.modalScrim}>
          <View style={[st.modalSheet, { maxWidth: 360 }]}>
            <Ionicons
              name="musical-notes"
              size={36}
              color={Colors.dark.primary}
              style={{ alignSelf: "center", marginBottom: Spacing.md }}
            />
            <ThemedText type="h4" style={st.modalTitle}>
              Audio playing in background
            </ThemedText>
            <ThemedText
              type="body"
              style={{
                color: Colors.dark.textSecondary,
                textAlign: "center",
                marginBottom: Spacing.xl,
              }}
            >
              Do you want to keep the audio playing after you leave?
            </ThemedText>
            <TVFocusablePressable
              onPress={() => {
                setShowStopAudioModal(false);
                onBack?.();
              }}
              baseStyle={st.optionRow}
              focusedStyle={st.optionRowFocused}
              hasTVPreferredFocus={isTV}
              accessibilityLabel="Keep playing and go back"
            >
              <Ionicons
                name="musical-notes-outline"
                size={22}
                color={Colors.dark.primary}
                style={{ marginRight: Spacing.md }}
              />
              <ThemedText type="body" style={{ color: "#fff", flex: 1 }}>
                Keep playing
              </ThemedText>
            </TVFocusablePressable>
            <TVFocusablePressable
              onPress={() => {
                TvPlayerCommands.disableBackgroundAudio(tvPlayerRef);
                setShowStopAudioModal(false);
                onBack?.();
              }}
              baseStyle={st.optionRow}
              focusedStyle={st.optionRowFocused}
              accessibilityLabel="Stop audio and go back"
            >
              <Ionicons
                name="stop-circle-outline"
                size={22}
                color={Colors.dark.error}
                style={{ marginRight: Spacing.md }}
              />
              <ThemedText
                type="body"
                style={{ color: Colors.dark.error, flex: 1 }}
              >
                Stop audio
              </ThemedText>
            </TVFocusablePressable>
          </View>
        </View>
      </Modal>

      {/* ── Settings modal ──────────────────────────────────────────── */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <Pressable
          style={st.modalScrim}
          onPress={() => setShowSettingsModal(false)}
        >
          <View style={st.modalSheet}>
            <ThemedText type="h4" style={st.modalTitle}>
              Settings
            </ThemedText>
            {[
              {
                label: "Quality",
                value: selectedQuality,
                icon: "layers-outline" as const,
                onPress: () => {
                  setShowSettingsModal(false);
                  setShowQualityModal(true);
                },
                hidden: qualities.length === 0,
              },
              {
                label: "Aspect ratio",
                value: currentAspectLabel,
                icon: "scan-outline" as const,
                onPress: () => {
                  setShowSettingsModal(false);
                  setShowAspectModal(true);
                },
              },
              {
                label: "Audio track",
                value: selectedAudioTrack
                  ? (propAudioTracks.find((t) => t.id === selectedAudioTrack)
                      ?.label ?? "Custom")
                  : "Default",
                icon: "volume-medium-outline" as const,
                onPress: () => {
                  setShowSettingsModal(false);
                  setShowAudioModal(true);
                },
                hidden: propAudioTracks.length === 0,
              },
              {
                label: "Subtitles",
                value:
                  selectedSubtitleTrack !== null
                    ? (propSubtitleTracks.find(
                        (t) => t.id === selectedSubtitleTrack,
                      )?.label ?? "On")
                    : "Off",
                icon: "text" as const,
                onPress: () => {
                  setShowSettingsModal(false);
                  setShowSubtitleModal(true);
                },
                hidden: propSubtitleTracks.length === 0,
              },
            ]
              .filter((item) => !item.hidden)
              .map((item, idx) => (
                <TVFocusablePressable
                  key={item.label}
                  onPress={item.onPress}
                  baseStyle={st.settingsRow}
                  focusedStyle={st.settingsRowFocused}
                  hasTVPreferredFocus={isTV && idx === 0}
                >
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={Colors.dark.textSecondary}
                    style={{ marginRight: Spacing.md }}
                  />
                  <ThemedText type="body" style={{ color: "#fff", flex: 1 }}>
                    {item.label}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: Colors.dark.textSecondary }}
                  >
                    {item.value}
                  </ThemedText>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors.dark.textSecondary}
                    style={{ marginLeft: 4 }}
                  />
                </TVFocusablePressable>
              ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Quality modal ────────────────────────────────────────────── */}
      <Modal
        visible={showQualityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualityModal(false)}
      >
        <Pressable
          style={st.modalScrim}
          onPress={() => setShowQualityModal(false)}
        >
          <View style={st.modalSheet}>
            <ThemedText type="h4" style={st.modalTitle}>
              Quality
            </ThemedText>
            <TVFocusablePressable
              onPress={() => handleQualitySelect("auto")}
              baseStyle={[
                st.optionRow,
                selectedQuality === "auto" && st.optionRowActive,
              ]}
              focusedStyle={st.optionRowFocused}
              hasTVPreferredFocus={isTV}
            >
              <ThemedText type="body" style={{ color: "#fff", flex: 1 }}>
                Auto
              </ThemedText>
              {selectedQuality === "auto" ? (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={Colors.dark.primary}
                />
              ) : null}
            </TVFocusablePressable>
            {qualities.map((q) => (
              <TVFocusablePressable
                key={q.label}
                onPress={() => handleQualitySelect(q)}
                baseStyle={[
                  st.optionRow,
                  selectedQuality === q.label && st.optionRowActive,
                ]}
                focusedStyle={st.optionRowFocused}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ color: "#fff" }}>
                    {q.label}
                  </ThemedText>
                  {q.bitrate ? (
                    <ThemedText
                      type="caption"
                      style={{ color: Colors.dark.textSecondary }}
                    >
                      {q.bitrate >= 1_000_000
                        ? `${(q.bitrate / 1_000_000).toFixed(1)} Mbps`
                        : `${Math.round(q.bitrate / 1000)} kbps`}
                    </ThemedText>
                  ) : null}
                </View>
                {selectedQuality === q.label ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={Colors.dark.primary}
                  />
                ) : null}
              </TVFocusablePressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Aspect ratio modal ──────────────────────────────────────── */}
      <Modal
        visible={showAspectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAspectModal(false)}
      >
        <Pressable
          style={st.modalScrim}
          onPress={() => setShowAspectModal(false)}
        >
          <View style={st.modalSheet}>
            <ThemedText type="h4" style={st.modalTitle}>
              Aspect Ratio
            </ThemedText>
            {CONTENT_FIT_OPTIONS.map((opt, idx) => (
              <TVFocusablePressable
                key={opt.value}
                onPress={() => {
                  setContentFit(opt.value);
                  TvPlayerCommands.setResizeMode(tvPlayerRef, opt.value);
                  setShowAspectModal(false);
                }}
                baseStyle={[
                  st.optionRow,
                  contentFit === opt.value && st.optionRowActive,
                ]}
                focusedStyle={st.optionRowFocused}
                hasTVPreferredFocus={isTV && idx === 0}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={22}
                  color={Colors.dark.textSecondary}
                  style={{ marginRight: Spacing.md }}
                />
                <ThemedText type="body" style={{ color: "#fff", flex: 1 }}>
                  {opt.label}
                </ThemedText>
                {contentFit === opt.value ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={Colors.dark.primary}
                  />
                ) : null}
              </TVFocusablePressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Audio modal ──────────────────────────────────────────────── */}
      <Modal
        visible={showAudioModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAudioModal(false)}
      >
        <Pressable
          style={st.modalScrim}
          onPress={() => setShowAudioModal(false)}
        >
          <View style={st.modalSheet}>
            <ThemedText type="h4" style={st.modalTitle}>
              Audio Track
            </ThemedText>
            {propAudioTracks.length === 0 ? (
              <View style={st.emptyState}>
                <Ionicons
                  name="volume-mute-outline"
                  size={32}
                  color={Colors.dark.textSecondary}
                />
                <ThemedText
                  type="small"
                  style={{
                    color: Colors.dark.textSecondary,
                    marginTop: Spacing.sm,
                  }}
                >
                  No additional audio tracks
                </ThemedText>
              </View>
            ) : (
              propAudioTracks.map((track, idx) => (
                <TVFocusablePressable
                  key={track.id}
                  onPress={() => {
                    setSelectedAudioTrack(track.id);
                    setShowAudioModal(false);
                  }}
                  baseStyle={[
                    st.optionRow,
                    selectedAudioTrack === track.id && st.optionRowActive,
                  ]}
                  focusedStyle={st.optionRowFocused}
                  hasTVPreferredFocus={isTV && idx === 0}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ color: "#fff" }}>
                      {track.label}
                    </ThemedText>
                    <ThemedText
                      type="caption"
                      style={{ color: Colors.dark.textSecondary }}
                    >
                      {track.language}
                    </ThemedText>
                  </View>
                  {selectedAudioTrack === track.id ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={Colors.dark.primary}
                    />
                  ) : null}
                </TVFocusablePressable>
              ))
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Subtitle modal ───────────────────────────────────────────── */}
      <Modal
        visible={showSubtitleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubtitleModal(false)}
      >
        <Pressable
          style={st.modalScrim}
          onPress={() => setShowSubtitleModal(false)}
        >
          <View style={st.modalSheet}>
            <ThemedText type="h4" style={st.modalTitle}>
              Subtitles
            </ThemedText>
            <TVFocusablePressable
              onPress={() => {
                setSelectedSubtitleTrack(null);
                setShowSubtitleModal(false);
              }}
              baseStyle={[
                st.optionRow,
                selectedSubtitleTrack === null && st.optionRowActive,
              ]}
              focusedStyle={st.optionRowFocused}
              hasTVPreferredFocus={isTV}
            >
              <ThemedText type="body" style={{ color: "#fff", flex: 1 }}>
                Off
              </ThemedText>
              {selectedSubtitleTrack === null ? (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={Colors.dark.primary}
                />
              ) : null}
            </TVFocusablePressable>
            {propSubtitleTracks.map((track) => (
              <TVFocusablePressable
                key={track.id}
                onPress={() => {
                  setSelectedSubtitleTrack(track.id);
                  setShowSubtitleModal(false);
                }}
                baseStyle={[
                  st.optionRow,
                  selectedSubtitleTrack === track.id && st.optionRowActive,
                ]}
                focusedStyle={st.optionRowFocused}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ color: "#fff" }}>
                    {track.label}
                  </ThemedText>
                  <ThemedText
                    type="caption"
                    style={{ color: Colors.dark.textSecondary }}
                  >
                    {track.language}
                  </ThemedText>
                </View>
                {selectedSubtitleTrack === track.id ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={Colors.dark.primary}
                  />
                ) : null}
              </TVFocusablePressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  videoWrap: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },

  // Overlays
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 10,
  },
  loadingText: {
    color: "#fff",
    marginTop: Spacing.md,
  },
  errorBox: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    maxWidth: 320,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  retryBtn: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  retryBtnFocused: {
    backgroundColor: Colors.dark.primary + "50",
    transform: [{ scale: 1.06 }],
  },

  // Seek flash
  seekFlash: {
    position: "absolute",
    top: "35%",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    zIndex: 20,
  },
  seekFlashLeft: { left: "10%" },
  seekFlashRight: { right: "10%" },
  seekFlashText: { color: "#fff", marginTop: 4 },

  // Lock
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    zIndex: 30,
  },
  lockBox: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  unlockBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },

  // Controls overlay
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.38)",
    zIndex: 15,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: Spacing.sm,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 48,
  },
  topCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 48,
    justifyContent: "flex-end",
  },
  titleText: {
    color: "#fff",
    textAlign: "center",
  },
  subtitleText: {
    color: Colors.dark.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },

  // Icon buttons
  iconBtn: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconBtnActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  iconBtnFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "40",
    transform: [{ scale: 1.1 }],
  },

  // Center transport
  centerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing["2xl"],
  },
  playBtn: {
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  playBtnFocused: {
    borderColor: "#fff",
    transform: [{ scale: 1.08 }],
  },
  navBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  navBtnFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(255,255,255,0.28)",
    transform: [{ scale: 1.08 }],
  },

  // Bottom bar
  bottomBar: {
    paddingTop: Spacing.sm,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  timeText: {
    color: "#fff",
    minWidth: 48,
    textAlign: "center",
  },
  seekBar: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  seekBarFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  seekBarTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  },
  seekBarTrackFocused: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  seekBarFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  seekThumb: {
    position: "absolute",
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.primary,
    marginLeft: -7,
  },
  seekThumbFocused: {
    width: 20,
    height: 20,
    borderRadius: 10,
    top: -7,
    marginLeft: -10,
    borderWidth: 2,
    borderColor: "#fff",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    marginRight: 4,
  },
  liveText: {
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  drmBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  bottomRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  toolBtn: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 2,
    borderColor: "transparent",
  },
  toolBtnActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary,
  },
  toolBtnFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(255,255,255,0.28)",
    transform: [{ scale: 1.12 }],
  },

  // Recent channels panel
  recentPanel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 280,
    backgroundColor: "rgba(10,10,10,0.97)",
    zIndex: 25,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.08)",
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginTop: Spacing.md,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: BorderRadius.xs,
  },
  recentItemFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  recentLogo: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  recentLogoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },

  // Modals
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalSheet: {
    width: "85%",
    maxWidth: 400,
    maxHeight: "75%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  modalTitle: {
    color: "#fff",
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: BorderRadius.xs,
  },
  settingsRowFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "transparent",
    marginBottom: 2,
  },
  optionRowActive: {
    backgroundColor: Colors.dark.primary + "18",
  },
  optionRowFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "30",
    transform: [{ scale: 1.02 }],
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
});
