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
} from "react-native";
import { useVideoPlayer, VideoView, VideoContentFit } from "expo-video";
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

// Use the native ExoPlayer/Media3 module on all Android devices.
// On TV: SurfaceView avoids TextureView z-ordering issues in the Leanback compositor.
// On mobile: gives us a real foreground-service background-audio path that
// expo-video does not expose at the JS level.
const isTV = Platform.isTV;
const useNativeTvPlayer = Platform.OS === "android";

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
}) {
  const [isFocused, setIsFocused] = useState(false);
  const tvProps: any = {};
  if (hasTVPreferredFocus) tvProps.hasTVPreferredFocus = true;
  const styles = Array.isArray(baseStyle) ? baseStyle : [baseStyle];
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={focusable}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      hitSlop={hitSlop}
      {...tvProps}
      style={[...styles, isFocused && focusedStyle] as ViewStyle[]}
    >
      {children}
    </Pressable>
  );
}

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

const CONTENT_FIT_OPTIONS: {
  label: string;
  description: string;
  value: VideoContentFit;
  icon: string;
}[] = [
  {
    label: "Fit",
    description: "Show full video with bars",
    value: "contain",
    icon: "contract-outline",
  },
  {
    label: "Fill",
    description: "Fill screen, may crop edges",
    value: "cover",
    icon: "expand-outline",
  },
  {
    label: "Stretch",
    description: "Stretch to fill screen",
    value: "fill",
    icon: "resize-outline",
  },
];

const CONTROLS_TIMEOUT = 5000;
const SEEK_SECONDS = 10;

const placeholderImage = require("../../assets/images/placeholder-channel.png");

const arePropsEqual = (
  prevProps: AdvancedVideoPlayerProps,
  nextProps: AdvancedVideoPlayerProps,
): boolean => {
  return (
    prevProps.source === nextProps.source &&
    prevProps.title === nextProps.title &&
    prevProps.subtitle === nextProps.subtitle &&
    prevProps.poster === nextProps.poster &&
    prevProps.autoPlay === nextProps.autoPlay &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.isLive === nextProps.isLive &&
    JSON.stringify(prevProps.headers) === JSON.stringify(nextProps.headers) &&
    JSON.stringify(prevProps.drm) === JSON.stringify(nextProps.drm)
  );
};

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
  const { playerControls, isUltraWide, width, height } = useResponsive();
  const videoRef = useRef<VideoView>(null);
  // Ref for the native TvPlayerView (Android TV only)
  const tvPlayerRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [showControls, setShowControls] = useState(false);
  const [showRecentChannels, setShowRecentChannels] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  // Android only — tracks whether the foreground service is running
  const [isBackgroundPlaying, setIsBackgroundPlaying] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const [detectedQualities, setDetectedQualities] = useState<VideoQuality[]>(
    [],
  );
  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [currentSource, setCurrentSource] = useState(source);
  const [contentFit, setContentFit] = useState<VideoContentFit>("contain");
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<string | null>(
    null,
  );
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<
    string | null
  >(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);

  const [seekIndicator, setSeekIndicator] = useState<{
    visible: boolean;
    direction: "forward" | "backward";
    seconds: number;
  }>({
    visible: false,
    direction: "forward",
    seconds: 0,
  });

  const controlsOpacity = useSharedValue(0);
  const recentPanelTranslate = useSharedValue(300);
  const seekIndicatorOpacity = useSharedValue(0);
  const lockIndicatorOpacity = useSharedValue(0);
  const showControlsRef = useRef(showControls);
  const resetControlsTimeoutRef = useRef<() => void>(() => {});

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  const qualities =
    detectedQualities.length > 0 ? detectedQualities : propQualities;
  const audioTracks = propAudioTracks;
  const subtitleTracks = propSubtitleTracks;

  useEffect(() => {
    if (source && isHLSStream(source)) {
      parseHLSQualities(source)
        .then((parsedQualities) => {
          if (parsedQualities.length > 0) {
            setDetectedQualities(parsedQualities);
          }
        })
        .catch((err) => {
          console.warn("Failed to parse HLS qualities:", err);
        });
    }
  }, [source]);

  const videoSource = useMemo(() => {
    if (headers && Object.keys(headers).length > 0) {
      return {
        uri: currentSource,
        headers: headers,
      };
    }
    return currentSource;
  }, [currentSource, headers]);

  // expo-video player — only used on non-TV or iOS
  const player = useVideoPlayer(
    useNativeTvPlayer ? null : videoSource,
    (player) => {
      player.loop = true;
      if (autoPlay) {
        player.play();
      }
    },
  );

  const animatedControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const animatedRecentPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: recentPanelTranslate.value }],
  }));

  const animatedSeekIndicatorStyle = useAnimatedStyle(() => ({
    opacity: seekIndicatorOpacity.value,
  }));

  const animatedLockIndicatorStyle = useAnimatedStyle(() => ({
    opacity: lockIndicatorOpacity.value,
  }));

  useEffect(() => {
    if (showControls && !isLocked) {
      controlsOpacity.value = withTiming(1, { duration: 200 });
      startControlsTimeout();
    } else if (!showControls || isLocked) {
      controlsOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [showControls, isLocked]);

  useEffect(() => {
    if (showRecentChannels) {
      recentPanelTranslate.value = withSpring(0, {
        damping: 20,
        stiffness: 200,
      });
    } else {
      recentPanelTranslate.value = withSpring(300, {
        damping: 20,
        stiffness: 200,
      });
    }
  }, [showRecentChannels]);

  // Load source into native TvPlayerView.
  // Called both on source/header/drm changes AND when the view first mounts
  // (handled via the tvPlayerCallbackRef below which fires once the ref is set).
  const loadNativeSource = useCallback(() => {
    if (!useNativeTvPlayer || !tvPlayerRef.current) return;
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

  // Re-run whenever the source / drm / headers change (tvPlayerRef is already set)
  useEffect(() => {
    if (!useNativeTvPlayer) return;
    loadNativeSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSource, headers, drm, autoPlay]);

  // Callback ref: fires once the TvPlayerView node is actually attached so the
  // initial loadSource runs even before the deps-based effect above sees a change.
  const tvPlayerCallbackRef = useCallback(
    (node: any) => {
      (tvPlayerRef as React.MutableRefObject<any>).current = node;
      if (node) {
        loadNativeSource();
      }
    },
    // loadNativeSource identity changes with source/headers/drm, but that's fine —
    // this only runs once on mount (node !== null) and once on unmount (node === null).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Cleanup native player on unmount (TV)
  useEffect(() => {
    if (!useNativeTvPlayer) return;
    return () => {
      TvPlayerCommands.release(tvPlayerRef);
    };
  }, []);

  useEffect(() => {
    if (useNativeTvPlayer) return; // handled via onReady/onError/onPlayingChange/onBufferingChange props
    if (!player) return;

    const statusSubscription = player.addListener(
      "statusChange",
      (payload: any) => {
        const status = payload?.status || payload;
        if (status === "readyToPlay") {
          setIsLoading(false);
          setError(null);
          setIsBuffering(false);
        } else if (status === "error") {
          setIsLoading(false);
          setIsBuffering(false);
          setError("Failed to load stream");
          onError?.("Failed to load stream");
        } else if (status === "loading") {
          setIsLoading(true);
        }
      },
    );

    const playingSubscription = player.addListener(
      "playingChange",
      (payload: any) => {
        const playing =
          typeof payload === "boolean" ? payload : payload?.isPlaying;
        setIsPlaying(!!playing);
      },
    );

    const timeUpdateInterval = setInterval(() => {
      if (player && !isLive) {
        setCurrentTime(player.currentTime);
        setDuration(player.duration || 0);
      }
    }, 500);

    return () => {
      statusSubscription.remove();
      playingSubscription.remove();
      clearInterval(timeUpdateInterval);
    };
  }, [player, onError, isLive]);

  const startControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isTV) return;
    controlsTimeoutRef.current = setTimeout(() => {
      if (
        isPlaying &&
        !showSettingsModal &&
        !showQualityModal &&
        !showZoomModal &&
        !showAudioModal &&
        !showSubtitleModal
      ) {
        setShowControls(false);
        setShowRecentChannels(false);
      }
    }, CONTROLS_TIMEOUT);
  };

  const resetControlsTimeout = useCallback(() => {
    startControlsTimeout();
  }, []);

  useEffect(() => {
    resetControlsTimeoutRef.current = resetControlsTimeout;
  }, [resetControlsTimeout]);

  const handleScreenTap = useCallback(() => {
    if (isLocked) {
      lockIndicatorOpacity.value = withTiming(1, { duration: 150 });
      setTimeout(() => {
        lockIndicatorOpacity.value = withTiming(0, { duration: 300 });
      }, 1500);
      return;
    }
    setShowControls((prev) => !prev);
    if (!showControls) {
      setShowRecentChannels(false);
    }
  }, [isLocked, showControls]);

  const handleDoubleTap = useCallback(
    (x: number) => {
      if (isLocked || isLive) return;

      const screenWidth = width;
      const isLeftSide = x < screenWidth / 2;
      const seekAmount = isLeftSide ? -SEEK_SECONDS : SEEK_SECONDS;

      if (useNativeTvPlayer || player) {
        const newTime = Math.max(
          0,
          Math.min((player?.currentTime ?? currentTime) + seekAmount, duration),
        );
        if (useNativeTvPlayer) {
          TvPlayerCommands.seekTo(tvPlayerRef, newTime * 1000);
        } else if (player) {
          player.currentTime = newTime;
        }
        if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        setSeekIndicator({
          visible: true,
          direction: isLeftSide ? "backward" : "forward",
          seconds: SEEK_SECONDS,
        });
        seekIndicatorOpacity.value = withTiming(1, { duration: 100 });

        setTimeout(() => {
          seekIndicatorOpacity.value = withTiming(0, { duration: 300 });
          setTimeout(() => {
            setSeekIndicator((prev) => ({ ...prev, visible: false }));
          }, 300);
        }, 600);
      }
    },
    [isLocked, isLive, player, width, duration],
  );

  const handlePlayPause = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (useNativeTvPlayer) {
      if (isPlaying) {
        TvPlayerCommands.pause(tvPlayerRef);
      } else {
        TvPlayerCommands.play(tvPlayerRef);
      }
    } else if (player) {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    }
    resetControlsTimeout();
  }, [player, isPlaying]);

  const handleSeek = useCallback(
    (seconds: number) => {
      if (!isLive) {
        if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (useNativeTvPlayer) {
          const newTimeMs = Math.max(
            0,
            Math.min((currentTime + seconds) * 1000, duration * 1000),
          );
          TvPlayerCommands.seekTo(tvPlayerRef, newTimeMs);
        } else if (player) {
          const newTime = Math.max(
            0,
            Math.min(currentTime + seconds, duration),
          );
          player.currentTime = newTime;
        }
      }
      resetControlsTimeout();
    },
    [player, currentTime, duration, isLive],
  );

  const handleQualitySelect = useCallback(
    (quality: string) => {
      if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedQuality(quality);

      if (quality === "auto") {
        setCurrentSource(source);
      } else {
        const selectedQ = qualities.find((q) => q.label === quality);
        if (selectedQ?.url) {
          setCurrentSource(selectedQ.url);
        }
      }

      setShowQualityModal(false);
      resetControlsTimeout();
    },
    [source, qualities],
  );

  const handleZoomSelect = useCallback((fit: VideoContentFit) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContentFit(fit);
    setShowZoomModal(false);
    resetControlsTimeout();
  }, []);

  const handleAudioTrackSelect = useCallback((trackId: string) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAudioTrack(trackId);
    setShowAudioModal(false);
    resetControlsTimeout();
  }, []);

  const handleSubtitleTrackSelect = useCallback((trackId: string | null) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSubtitleTrack(trackId);
    setSubtitlesEnabled(trackId !== null);
    setShowSubtitleModal(false);
    resetControlsTimeout();
  }, []);

  const handleAspectRatioCycle = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentIndex = CONTENT_FIT_OPTIONS.findIndex(
      (o) => o.value === contentFit,
    );
    const nextIndex = (currentIndex + 1) % CONTENT_FIT_OPTIONS.length;
    setContentFit(CONTENT_FIT_OPTIONS[nextIndex].value);
    resetControlsTimeout();
  }, [contentFit]);

  const handlePiP = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (videoRef.current) {
      videoRef.current.startPictureInPicture();
    }
    resetControlsTimeout();
  }, []);

  const handleLockToggle = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLocked((prev) => !prev);
    if (!isLocked) {
      setShowControls(false);
      setShowRecentChannels(false);
    }
  }, [isLocked]);

  const handleBackgroundToggle = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isBackgroundPlaying) {
      TvPlayerCommands.disableBackgroundAudio(tvPlayerRef);
    } else {
      TvPlayerCommands.enableBackgroundAudio(tvPlayerRef);
    }
    resetControlsTimeout();
  }, [isBackgroundPlaying]);

  const handleRecentChannelPress = useCallback(
    (channelId: string) => {
      if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChannelSelect?.(channelId);
      setShowRecentChannels(false);
    },
    [onChannelSelect],
  );

  const toggleRecentChannels = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowRecentChannels((prev) => !prev);
    resetControlsTimeout();
  }, []);

  useEffect(() => {
    if (!isTV) return;

    let tvEventHandler: any = null;
    try {
      const RN = require("react-native");
      const TVHandler = RN.TVEventHandler;
      if (TVHandler) {
        tvEventHandler = new TVHandler();
        tvEventHandler.enable({} as any, (_cmp: any, evt: any) => {
          if (!evt) return;
          const { eventType } = evt;
          const controlsVisible = showControlsRef.current;
          if (eventType === "select" || eventType === "playPause") {
            if (!controlsVisible) {
              setShowControls(true);
              resetControlsTimeoutRef.current();
            } else {
              resetControlsTimeoutRef.current();
            }
          } else if (eventType === "up" || eventType === "down") {
            if (!controlsVisible) {
              setShowControls(true);
              resetControlsTimeoutRef.current();
            } else {
              resetControlsTimeoutRef.current();
            }
          } else if (eventType === "left") {
            if (!controlsVisible) {
              setShowControls(true);
              resetControlsTimeoutRef.current();
            } else {
              resetControlsTimeoutRef.current();
            }
          } else if (eventType === "right") {
            if (!controlsVisible) {
              setShowControls(true);
              resetControlsTimeoutRef.current();
            } else {
              resetControlsTimeoutRef.current();
            }
          } else if (eventType === "menu" || eventType === "back") {
            if (controlsVisible) {
              setShowControls(false);
              setShowRecentChannels(false);
            } else if (onBack) {
              onBack();
            }
          }
        });
      }
    } catch (e) {
      console.log("TVEventHandler error:", e);
    }

    return () => {
      if (tvEventHandler) {
        try {
          tvEventHandler.disable();
        } catch (e) {}
      }
    };
  }, [isTV, onBack]);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getQualityLabel = () => {
    if (selectedQuality === "auto") return "Auto";
    const quality = qualities.find((q) => q.label === selectedQuality);
    return quality?.resolution || selectedQuality;
  };

  const getZoomLabel = () => {
    const option = CONTENT_FIT_OPTIONS.find((o) => o.value === contentFit);
    return option?.label || "Fit";
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(handleScreenTap)();
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      runOnJS(handleDoubleTap)(event.x);
    });

  const composedGesture = Gesture.Exclusive(doubleTapGesture, tapGesture);

  const displayedRecentChannels = recentChannels.slice(0, 4);

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <View style={styles.videoContainer}>
          {useNativeTvPlayer ? (
            <TvPlayerView
              ref={tvPlayerCallbackRef}
              style={styles.video}
              onReady={() => {
                setIsLoading(false);
                setError(null);
                setIsBuffering(false);
              }}
              onError={(e) => {
                const msg = e.nativeEvent.message || "Failed to load stream";
                setIsLoading(false);
                setIsBuffering(false);
                setError(msg);
                onError?.(msg);
              }}
              onPlayingChange={(e) => {
                setIsPlaying(e.nativeEvent.isPlaying);
              }}
              onBufferingChange={(e) => {
                setIsBuffering(e.nativeEvent.isBuffering);
                if (e.nativeEvent.isBuffering) setIsLoading(false);
              }}
              onBackgroundAudioChange={(e) => {
                setIsBackgroundPlaying(e.nativeEvent.enabled);
              }}
            />
          ) : (
            <VideoView
              ref={videoRef}
              player={player}
              style={styles.video}
              contentFit={contentFit}
              nativeControls={false}
              allowsPictureInPicture
            />
          )}

          {(isLoading || isBuffering) && !error ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={Colors.dark.primary} />
              <ThemedText type="body" style={styles.loadingText}>
                {isBuffering ? "Buffering..." : "Loading stream..."}
              </ThemedText>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorOverlay} pointerEvents="box-none">
              <View style={styles.errorContent}>
                <Ionicons
                  name="cloud-offline"
                  size={48}
                  color={Colors.dark.error}
                />
                <ThemedText type="body" style={styles.errorText}>
                  {error}
                </ThemedText>
                <Pressable
                  onPress={() => {
                    setIsLoading(true);
                    setError(null);
                    if (useNativeTvPlayer) {
                      TvPlayerCommands.loadSource(tvPlayerRef, {
                        url: currentSource,
                        headers:
                          headers && Object.keys(headers).length > 0
                            ? headers
                            : undefined,
                        drmType: drm?.type as any,
                        drmLicenseUrl: drm?.licenseServer,
                        drmHeaders: drm?.headers,
                        autoPlay: true,
                      });
                    } else if (player) {
                      player.play();
                    }
                  }}
                  style={styles.retryButton}
                  focusable={true}
                  accessibilityLabel="Retry"
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="refresh"
                    size={20}
                    color={Colors.dark.primary}
                  />
                  <ThemedText
                    type="body"
                    style={{ color: Colors.dark.primary, marginLeft: 8 }}
                  >
                    Retry
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          {seekIndicator.visible ? (
            <Animated.View
              style={[
                styles.seekIndicator,
                seekIndicator.direction === "backward"
                  ? styles.seekIndicatorLeft
                  : styles.seekIndicatorRight,
                animatedSeekIndicatorStyle,
              ]}
            >
              <Ionicons
                name={
                  seekIndicator.direction === "backward"
                    ? "play-back"
                    : "play-forward"
                }
                size={32}
                color="#FFFFFF"
              />
              <ThemedText type="body" style={styles.seekIndicatorText}>
                {seekIndicator.seconds}s
              </ThemedText>
            </Animated.View>
          ) : null}

          {isLocked ? (
            <Animated.View
              style={[styles.lockIndicator, animatedLockIndicatorStyle]}
            >
              <View style={styles.lockIndicatorContent}>
                <Ionicons name="lock-closed" size={24} color="#FFFFFF" />
                <ThemedText type="body" style={styles.lockIndicatorText}>
                  Controls Locked
                </ThemedText>
                <Pressable
                  onPress={handleLockToggle}
                  style={styles.unlockButton}
                  hitSlop={16}
                  focusable={true}
                  accessibilityLabel="Unlock controls"
                  accessibilityRole="button"
                >
                  <ThemedText
                    type="small"
                    style={{ color: Colors.dark.primary }}
                  >
                    Tap to Unlock
                  </ThemedText>
                </Pressable>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {/* CHANGED: pointerEvents uses "box-none" when visible to allow taps on empty space to pass through */}
      <Animated.View
        style={[styles.controlsOverlay, animatedControlsStyle]}
        pointerEvents={showControls && !isLocked && !isTV ? "box-none" : "none"}
      >
        <View
          style={[
            styles.topControls,
            {
              paddingTop: insets.top + Spacing.sm,
              paddingLeft: insets.left + Spacing.md,
              paddingRight: insets.right + Spacing.md,
            },
          ]}
        >
          <View style={styles.topLeftControls}>
            {onBack ? (
              <TVFocusablePressable
                onPress={onBack}
                baseStyle={styles.controlButton}
                focusedStyle={styles.controlButtonFocused}
                hitSlop={16}
                accessibilityLabel="Go back"
              >
                <Ionicons
                  name="arrow-back"
                  size={playerControls.icon}
                  color="#FFFFFF"
                />
              </TVFocusablePressable>
            ) : null}
          </View>

          <View style={styles.titleContainer}>
            {title ? (
              <ThemedText
                type={isUltraWide ? "body" : "h4"}
                style={styles.title}
                numberOfLines={1}
              >
                {title}
              </ThemedText>
            ) : null}
            {subtitle ? (
              <ThemedText
                type="small"
                style={styles.subtitle}
                numberOfLines={1}
              >
                {subtitle}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.topRightControls}>
            {displayedRecentChannels.length > 0 ? (
              <TVFocusablePressable
                onPress={toggleRecentChannels}
                baseStyle={styles.controlButton}
                focusedStyle={styles.controlButtonFocused}
                hitSlop={16}
                accessibilityLabel="Recent channels"
              >
                <Ionicons
                  name="time-outline"
                  size={playerControls.icon}
                  color="#FFFFFF"
                />
              </TVFocusablePressable>
            ) : null}
            {onFavoritePress ? (
              <TVFocusablePressable
                onPress={onFavoritePress}
                baseStyle={styles.controlButton}
                focusedStyle={styles.controlButtonFocused}
                hitSlop={16}
                accessibilityLabel={
                  isFavorite ? "Remove from favorites" : "Add to favorites"
                }
              >
                <Ionicons
                  name={isFavorite ? "star" : "star-outline"}
                  size={playerControls.icon}
                  color={isFavorite ? Colors.dark.primary : "#FFFFFF"}
                />
              </TVFocusablePressable>
            ) : null}
            <TVFocusablePressable
              onPress={handleLockToggle}
              baseStyle={styles.controlButton}
              focusedStyle={styles.controlButtonFocused}
              hitSlop={16}
              accessibilityLabel="Lock controls"
            >
              <Ionicons
                name="lock-open-outline"
                size={playerControls.icon}
                color="#FFFFFF"
              />
            </TVFocusablePressable>
          </View>
        </View>

        <View style={styles.centerControls}>
          {onPrevious ? (
            <TVFocusablePressable
              onPress={onPrevious}
              baseStyle={[
                styles.navButton,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={styles.navButtonFocused}
              hitSlop={16}
              accessibilityLabel="Previous channel"
            >
              <Ionicons
                name="play-skip-back"
                size={playerControls.icon * 1.2}
                color="#FFFFFF"
              />
            </TVFocusablePressable>
          ) : !isLive ? (
            <TVFocusablePressable
              onPress={() => handleSeek(-SEEK_SECONDS)}
              baseStyle={[
                styles.navButton,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={styles.navButtonFocused}
              hitSlop={16}
              accessibilityLabel="Seek backward"
            >
              <Ionicons
                name="play-back"
                size={playerControls.icon * 1.2}
                color="#FFFFFF"
              />
            </TVFocusablePressable>
          ) : (
            <View
              style={{ width: playerControls.nav, height: playerControls.nav }}
            />
          )}

          <TVFocusablePressable
            onPress={handlePlayPause}
            baseStyle={[
              styles.playButton,
              {
                width: playerControls.play,
                height: playerControls.play,
                borderRadius: playerControls.play / 2,
              },
            ]}
            focusedStyle={styles.playButtonFocused}
            hitSlop={16}
            hasTVPreferredFocus={isTV && showControls}
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={playerControls.icon * 1.8}
              color="#FFFFFF"
            />
          </TVFocusablePressable>

          {onNext ? (
            <TVFocusablePressable
              onPress={onNext}
              baseStyle={[
                styles.navButton,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={styles.navButtonFocused}
              hitSlop={16}
              accessibilityLabel="Next channel"
            >
              <Ionicons
                name="play-skip-forward"
                size={playerControls.icon * 1.2}
                color="#FFFFFF"
              />
            </TVFocusablePressable>
          ) : !isLive ? (
            <TVFocusablePressable
              onPress={() => handleSeek(SEEK_SECONDS)}
              baseStyle={[
                styles.navButton,
                {
                  width: playerControls.nav,
                  height: playerControls.nav,
                  borderRadius: playerControls.nav / 2,
                },
              ]}
              focusedStyle={styles.navButtonFocused}
              hitSlop={16}
              accessibilityLabel="Seek forward"
            >
              <Ionicons
                name="play-forward"
                size={playerControls.icon * 1.2}
                color="#FFFFFF"
              />
            </TVFocusablePressable>
          ) : (
            <View
              style={{ width: playerControls.nav, height: playerControls.nav }}
            />
          )}
        </View>

        <View
          style={[
            styles.bottomControls,
            {
              paddingBottom: insets.bottom + Spacing.sm,
              paddingLeft: insets.left + Spacing.md,
              paddingRight: insets.right + Spacing.md,
            },
          ]}
        >
          {!isLive ? (
            <View style={styles.progressContainer}>
              <ThemedText type="caption" style={styles.timeText}>
                {formatTime(currentTime)}
              </ThemedText>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
              <ThemedText type="caption" style={styles.timeText}>
                {formatTime(duration)}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.bottomControlsRow}>
            <View style={styles.bottomLeft}>
              {isLive ? (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <ThemedText type="small" style={styles.liveText}>
                    LIVE
                  </ThemedText>
                </View>
              ) : null}
              {drm ? (
                <View style={styles.badge}>
                  <Ionicons
                    name="shield-checkmark"
                    size={12}
                    color={Colors.dark.success}
                  />
                  <ThemedText type="caption" style={styles.badgeText}>
                    DRM
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <View style={styles.bottomRight}>
              {/* Background audio — Android native player only */}
              {useNativeTvPlayer ? (
                <TVFocusablePressable
                  onPress={handleBackgroundToggle}
                  baseStyle={[
                    styles.settingsButton,
                    isBackgroundPlaying && styles.settingsButtonActive,
                  ]}
                  focusedStyle={styles.settingsButtonFocused}
                  accessibilityLabel={
                    isBackgroundPlaying
                      ? "Disable background audio"
                      : "Enable background audio"
                  }
                >
                  <Ionicons
                    name={
                      isBackgroundPlaying
                        ? "musical-notes"
                        : "musical-notes-outline"
                    }
                    size={20}
                    color={
                      isBackgroundPlaying ? Colors.dark.primary : "#FFFFFF"
                    }
                  />
                </TVFocusablePressable>
              ) : null}
              <TVFocusablePressable
                onPress={() => setShowSettingsModal(true)}
                baseStyle={styles.settingsButton}
                focusedStyle={styles.settingsButtonFocused}
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
              </TVFocusablePressable>
              {/* PiP only works on non-TV through expo-video's VideoView */}
              {!isTV && !useNativeTvPlayer ? (
                <TVFocusablePressable
                  onPress={handlePiP}
                  baseStyle={styles.settingsButton}
                  focusedStyle={styles.settingsButtonFocused}
                  accessibilityLabel="Picture in picture"
                >
                  <Ionicons name="browsers-outline" size={20} color="#FFFFFF" />
                </TVFocusablePressable>
              ) : null}
              <TVFocusablePressable
                onPress={handleAspectRatioCycle}
                baseStyle={styles.settingsButton}
                focusedStyle={styles.settingsButtonFocused}
                accessibilityLabel="Change aspect ratio"
              >
                <Ionicons name="expand-outline" size={20} color="#FFFFFF" />
              </TVFocusablePressable>
            </View>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.recentChannelsPanel,
          animatedRecentPanelStyle,
          {
            paddingRight: insets.right,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
        pointerEvents={showRecentChannels ? "auto" : "none"}
      >
        <View style={styles.recentChannelsHeader}>
          <ThemedText type="body" style={styles.recentChannelsTitle}>
            Recent
          </ThemedText>
          <Pressable
            onPress={() => setShowRecentChannels(false)}
            hitSlop={16}
            focusable={true}
            accessibilityLabel="Close recent channels"
            accessibilityRole="button"
            style={{ padding: 4, borderRadius: BorderRadius.xs }}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView style={styles.recentChannelsList}>
          {displayedRecentChannels.map((channel) => (
            <TVFocusablePressable
              key={channel.id}
              baseStyle={styles.recentChannelItem}
              focusedStyle={styles.recentChannelItemFocused}
              onPress={() => handleRecentChannelPress(channel.id)}
              accessibilityLabel={`Play ${channel.name}`}
            >
              <Image
                source={channel.logo ? { uri: channel.logo } : placeholderImage}
                style={styles.recentChannelLogo}
                contentFit="contain"
              />
              <View style={styles.recentChannelInfo}>
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  style={styles.recentChannelName}
                >
                  {channel.name}
                </ThemedText>
                <ThemedText
                  type="caption"
                  numberOfLines={1}
                  style={styles.recentChannelGroup}
                >
                  {channel.group}
                </ThemedText>
              </View>
            </TVFocusablePressable>
          ))}
        </ScrollView>
      </Animated.View>

      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSettingsModal(false)}
        >
          <View style={styles.settingsModalContent}>
            <ThemedText type="h4" style={styles.modalTitle}>
              Settings
            </ThemedText>

            <TVFocusablePressable
              baseStyle={styles.settingsMenuItem}
              focusedStyle={styles.settingsMenuItemFocused}
              onPress={() => {
                setShowSettingsModal(false);
                setShowQualityModal(true);
              }}
              accessibilityLabel="Quality"
            >
              <View style={styles.settingsMenuItemLeft}>
                <Ionicons name="options-outline" size={20} color="#FFFFFF" />
                <ThemedText type="body" style={styles.settingsMenuItemLabel}>
                  Quality
                </ThemedText>
              </View>
              <View style={styles.settingsMenuItemRight}>
                <ThemedText type="small" style={styles.settingsMenuItemValue}>
                  {getQualityLabel()}
                </ThemedText>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.dark.textSecondary}
                />
              </View>
            </TVFocusablePressable>

            <TVFocusablePressable
              baseStyle={styles.settingsMenuItem}
              focusedStyle={styles.settingsMenuItemFocused}
              onPress={() => {
                setShowSettingsModal(false);
                setShowZoomModal(true);
              }}
              accessibilityLabel="Aspect Ratio"
            >
              <View style={styles.settingsMenuItemLeft}>
                <Ionicons name="expand-outline" size={20} color="#FFFFFF" />
                <ThemedText type="body" style={styles.settingsMenuItemLabel}>
                  Aspect Ratio
                </ThemedText>
              </View>
              <View style={styles.settingsMenuItemRight}>
                <ThemedText type="small" style={styles.settingsMenuItemValue}>
                  {getZoomLabel()}
                </ThemedText>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.dark.textSecondary}
                />
              </View>
            </TVFocusablePressable>

            <TVFocusablePressable
              baseStyle={styles.settingsMenuItem}
              focusedStyle={styles.settingsMenuItemFocused}
              onPress={() => {
                setShowSettingsModal(false);
                setShowAudioModal(true);
              }}
              accessibilityLabel="Audio Track"
            >
              <View style={styles.settingsMenuItemLeft}>
                <Ionicons
                  name="volume-high-outline"
                  size={20}
                  color="#FFFFFF"
                />
                <ThemedText type="body" style={styles.settingsMenuItemLabel}>
                  Audio Track
                </ThemedText>
              </View>
              <View style={styles.settingsMenuItemRight}>
                <ThemedText type="small" style={styles.settingsMenuItemValue}>
                  {audioTracks.find((t) => t.id === selectedAudioTrack)
                    ?.label || "Default"}
                </ThemedText>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.dark.textSecondary}
                />
              </View>
            </TVFocusablePressable>

            <TVFocusablePressable
              baseStyle={styles.settingsMenuItem}
              focusedStyle={styles.settingsMenuItemFocused}
              onPress={() => {
                setShowSettingsModal(false);
                setShowSubtitleModal(true);
              }}
              accessibilityLabel="Subtitles"
            >
              <View style={styles.settingsMenuItemLeft}>
                <Ionicons name="text-outline" size={20} color="#FFFFFF" />
                <ThemedText type="body" style={styles.settingsMenuItemLabel}>
                  Subtitles
                </ThemedText>
              </View>
              <View style={styles.settingsMenuItemRight}>
                <ThemedText type="small" style={styles.settingsMenuItemValue}>
                  {subtitlesEnabled
                    ? subtitleTracks.find((t) => t.id === selectedSubtitleTrack)
                        ?.label || "On"
                    : "Off"}
                </ThemedText>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.dark.textSecondary}
                />
              </View>
            </TVFocusablePressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showQualityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualityModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowQualityModal(false)}
        >
          <View style={styles.modalContent}>
            <ThemedText type="h4" style={styles.modalTitle}>
              Video Quality
            </ThemedText>
            <TVFocusablePressable
              onPress={() => handleQualitySelect("auto")}
              baseStyle={[
                styles.modalOption,
                selectedQuality === "auto" && styles.modalOptionActive,
              ]}
              focusedStyle={styles.modalOptionFocused}
              accessibilityLabel="Auto quality"
            >
              <View>
                <ThemedText type="body">Auto</ThemedText>
                <ThemedText
                  type="caption"
                  style={{ color: Colors.dark.textSecondary }}
                >
                  Adjusts to your network
                </ThemedText>
              </View>
              {selectedQuality === "auto" ? (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={Colors.dark.primary}
                />
              ) : null}
            </TVFocusablePressable>
            {qualities.map((quality) => (
              <TVFocusablePressable
                key={quality.label}
                onPress={() => handleQualitySelect(quality.label)}
                baseStyle={[
                  styles.modalOption,
                  selectedQuality === quality.label && styles.modalOptionActive,
                ]}
                focusedStyle={styles.modalOptionFocused}
                accessibilityLabel={quality.resolution}
              >
                <View>
                  <ThemedText type="body">{quality.resolution}</ThemedText>
                  {quality.bitrate ? (
                    <ThemedText
                      type="caption"
                      style={{ color: Colors.dark.textSecondary }}
                    >
                      {quality.bitrate >= 1000000
                        ? `${(quality.bitrate / 1000000).toFixed(1)} Mbps`
                        : `${Math.round(quality.bitrate / 1000)} kbps`}
                    </ThemedText>
                  ) : null}
                </View>
                {selectedQuality === quality.label ? (
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

      <Modal
        visible={showZoomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowZoomModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowZoomModal(false)}
        >
          <View style={styles.modalContent}>
            <ThemedText type="h4" style={styles.modalTitle}>
              Aspect Ratio
            </ThemedText>
            {CONTENT_FIT_OPTIONS.map((option) => (
              <TVFocusablePressable
                key={option.value}
                onPress={() => handleZoomSelect(option.value)}
                baseStyle={[
                  styles.modalOption,
                  contentFit === option.value && styles.modalOptionActive,
                ]}
                focusedStyle={styles.modalOptionFocused}
                accessibilityLabel={option.label}
              >
                <View style={styles.zoomOptionContent}>
                  <Ionicons
                    name={option.icon as any}
                    size={20}
                    color="#FFFFFF"
                    style={{ marginRight: 12 }}
                  />
                  <View>
                    <ThemedText type="body">{option.label}</ThemedText>
                    <ThemedText
                      type="caption"
                      style={{ color: Colors.dark.textSecondary }}
                    >
                      {option.description}
                    </ThemedText>
                  </View>
                </View>
                {contentFit === option.value ? (
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

      <Modal
        visible={showAudioModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAudioModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAudioModal(false)}
        >
          <View style={styles.modalContent}>
            <ThemedText type="h4" style={styles.modalTitle}>
              Audio Track
            </ThemedText>
            {audioTracks.length > 0 ? (
              audioTracks.map((track) => (
                <TVFocusablePressable
                  key={track.id}
                  onPress={() => handleAudioTrackSelect(track.id)}
                  baseStyle={[
                    styles.modalOption,
                    selectedAudioTrack === track.id && styles.modalOptionActive,
                  ]}
                  focusedStyle={styles.modalOptionFocused}
                  accessibilityLabel={track.label}
                >
                  <View>
                    <ThemedText type="body">{track.label}</ThemedText>
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
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="volume-mute-outline"
                  size={32}
                  color={Colors.dark.textSecondary}
                />
                <ThemedText type="body" style={styles.emptyStateText}>
                  No additional audio tracks
                </ThemedText>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showSubtitleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubtitleModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSubtitleModal(false)}
        >
          <View style={styles.modalContent}>
            <ThemedText type="h4" style={styles.modalTitle}>
              Subtitles
            </ThemedText>
            <TVFocusablePressable
              onPress={() => handleSubtitleTrackSelect(null)}
              baseStyle={[
                styles.modalOption,
                !subtitlesEnabled && styles.modalOptionActive,
              ]}
              focusedStyle={styles.modalOptionFocused}
              accessibilityLabel="Subtitles off"
            >
              <ThemedText type="body">Off</ThemedText>
              {!subtitlesEnabled ? (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={Colors.dark.primary}
                />
              ) : null}
            </TVFocusablePressable>
            {subtitleTracks.length > 0 ? (
              subtitleTracks.map((track) => (
                <TVFocusablePressable
                  key={track.id}
                  onPress={() => handleSubtitleTrackSelect(track.id)}
                  baseStyle={[
                    styles.modalOption,
                    selectedSubtitleTrack === track.id &&
                      styles.modalOptionActive,
                  ]}
                  focusedStyle={styles.modalOptionFocused}
                  accessibilityLabel={track.label}
                >
                  <View>
                    <ThemedText type="body">{track.label}</ThemedText>
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
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="text-outline"
                  size={32}
                  color={Colors.dark.textSecondary}
                />
                <ThemedText type="body" style={styles.emptyStateText}>
                  No subtitles available
                </ThemedText>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}, arePropsEqual);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 9999,
    elevation: 9999,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: "#FFFFFF",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContent: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  errorText: {
    marginTop: Spacing.md,
    color: Colors.dark.error,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  retryButton: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  retryButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "50",
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 10,
    elevation: 10,
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  topLeftControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  topRightControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  controlButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  controlButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "50",
    transform: [{ scale: 1.15 }],
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  title: {
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  centerControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
  },
  playButton: {
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  playButtonFocused: {
    borderColor: "#FFFFFF",
    transform: [{ scale: 1.1 }],
  },
  navButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  navButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(255,255,255,0.3)",
    transform: [{ scale: 1.1 }],
  },
  bottomControls: {},
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    marginHorizontal: Spacing.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  timeText: {
    color: "#FFFFFF",
    minWidth: 50,
    textAlign: "center",
  },
  bottomControlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bottomLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bottomRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  liveIndicator: {
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
    backgroundColor: "#FFFFFF",
    marginRight: 4,
  },
  liveText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  badgeText: {
    color: "#FFFFFF",
    marginLeft: 4,
  },
  settingsButton: {
    padding: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  settingsButtonActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary,
  },
  settingsButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(255,255,255,0.35)",
    transform: [{ scale: 1.15 }],
  },
  seekIndicator: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -40 }],
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  seekIndicatorLeft: {
    left: "20%",
  },
  seekIndicatorRight: {
    right: "20%",
  },
  seekIndicatorText: {
    color: "#FFFFFF",
    marginTop: 4,
  },
  lockIndicator: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  lockIndicatorContent: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  lockIndicatorText: {
    color: "#FFFFFF",
    marginTop: Spacing.sm,
  },
  unlockButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  unlockButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "50",
  },
  recentChannelsPanel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 260,
    backgroundColor: "rgba(0,0,0,0.95)",
    paddingTop: Spacing.lg,
  },
  recentChannelsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  recentChannelsTitle: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  recentChannelsList: {
    flex: 1,
  },
  recentChannelItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: BorderRadius.xs,
  },
  recentChannelItemFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  recentChannelLogo: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  recentChannelInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  recentChannelName: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  recentChannelGroup: {
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  modalContent: {
    width: "80%",
    maxWidth: 360,
    maxHeight: "70%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  settingsModalContent: {
    width: "80%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  modalTitle: {
    color: "#FFFFFF",
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  modalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  modalOptionActive: {
    backgroundColor: Colors.dark.primary + "20",
  },
  modalOptionFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "30",
    transform: [{ scale: 1.03 }],
  },
  zoomOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsMenuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: BorderRadius.xs,
  },
  settingsMenuItemFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "30",
    transform: [{ scale: 1.03 }],
  },
  settingsMenuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsMenuItemLabel: {
    color: "#FFFFFF",
    marginLeft: Spacing.md,
  },
  settingsMenuItemRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsMenuItemValue: {
    color: Colors.dark.textSecondary,
    marginRight: Spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyStateText: {
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
    textAlign: "center",
  },
});
