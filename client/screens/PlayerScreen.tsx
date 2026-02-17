import React, { useEffect, useMemo, useCallback } from "react";
import { StyleSheet, View, Pressable, StatusBar, Platform } from "react-native";

const isTV = Platform.isTV;
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { AdvancedVideoPlayer, VideoQuality, DRMConfig } from "@/components/AdvancedVideoPlayer";
import { usePlaylist } from "@/context/PlaylistContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type PlayerRouteProp = RouteProp<RootStackParamList, "Player">;
type PlayerNavigationProp = NativeStackNavigationProp<RootStackParamList, "Player">;

const DEFAULT_QUALITIES: VideoQuality[] = [
  { label: "1080p", resolution: "1080p", bitrate: 5000000 },
  { label: "720p", resolution: "720p", bitrate: 2500000 },
  { label: "480p", resolution: "480p", bitrate: 1000000 },
  { label: "360p", resolution: "360p", bitrate: 500000 },
];

let NavigationBarModule: any = null;

async function loadNavigationBarModule() {
  if (Platform.OS === "android" && !NavigationBarModule) {
    try {
      NavigationBarModule = require("expo-navigation-bar");
    } catch (e) {
      console.log("Navigation bar module not available");
    }
  }
}

async function hideNavigationBar() {
  if (Platform.OS === "android" && NavigationBarModule) {
    try {
      await NavigationBarModule.setVisibilityAsync("hidden");
      await NavigationBarModule.setBehaviorAsync("overlay-swipe");
    } catch (e) {
      console.log("Navigation bar control not available");
    }
  }
}

async function showNavigationBar() {
  if (Platform.OS === "android" && NavigationBarModule) {
    try {
      await NavigationBarModule.setVisibilityAsync("visible");
    } catch (e) {
      console.log("Navigation bar control not available");
    }
  }
}

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PlayerNavigationProp>();
  const route = useRoute<PlayerRouteProp>();
  const { channelId } = route.params;

  const {
    getChannelById,
    favorites,
    toggleFavorite,
    addToRecent,
    playlist,
    settings,
    recentChannels,
  } = usePlaylist();

  const channel = getChannelById(channelId);
  const isFavorite = favorites.includes(channelId);

  const recentChannelObjects = useMemo(() => {
    if (!playlist) return [];
    return recentChannels
      .filter((id) => id !== channelId)
      .slice(0, 4)
      .map((id) => getChannelById(id))
      .filter((ch) => ch !== undefined) as NonNullable<ReturnType<typeof getChannelById>>[];
  }, [recentChannels, channelId, playlist, getChannelById]);

  useEffect(() => {
    if (channel) {
      addToRecent(channel.id);
    }
  }, [channel]);

  useEffect(() => {
    loadNavigationBarModule().then(() => {
      hideNavigationBar();
    });
    return () => {
      showNavigationBar();
    };
  }, []);

  const handleBack = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  }, [navigation]);

  const handleFavorite = useCallback(async () => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await toggleFavorite(channelId);
  }, [channelId, toggleFavorite]);

  const handleChannelNav = useCallback((direction: "prev" | "next") => {
    if (!playlist) return;

    const currentIndex = playlist.channels.findIndex(
      (ch) => ch.id === channelId
    );
    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === "prev") {
      newIndex =
        currentIndex === 0 ? playlist.channels.length - 1 : currentIndex - 1;
    } else {
      newIndex =
        currentIndex === playlist.channels.length - 1 ? 0 : currentIndex + 1;
    }

    const newChannel = playlist.channels[newIndex];
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.push("Player", { channelId: newChannel.id });
  }, [playlist, channelId, navigation]);

  const handleChannelSelect = useCallback((selectedChannelId: string) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.push("Player", { channelId: selectedChannelId });
  }, [navigation]);

  const handleError = useCallback((error: string) => {
    console.error("Player error:", error);
  }, []);

  const getDRMConfig = useCallback((): DRMConfig | undefined => {
    if (!channel?.drm) return undefined;

    return {
      type: channel.drm.type || "widevine",
      licenseServer: channel.drm.licenseServer || "",
      headers: channel.drm.headers,
      certificateUrl: channel.drm.certificateUrl,
    };
  }, [channel]);

  const getStreamHeaders = useCallback((): Record<string, string> | undefined => {
    const streamHeaders: Record<string, string> = {};
    if (channel?.headers) {
      Object.assign(streamHeaders, channel.headers);
    }
    if (channel?.drm?.headers) {
      Object.assign(streamHeaders, channel.drm.headers);
    }
    if (Object.keys(streamHeaders).length === 0) {
      return undefined;
    }
    return streamHeaders;
  }, [channel]);

  if (!channel) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <StatusBar hidden />
        <Ionicons name="alert-circle" size={40} color={Colors.dark.error} />
        <ThemedText type="h4" style={styles.errorTitle}>
          Channel Not Found
        </ThemedText>
        <Pressable
          onPress={handleBack}
          style={styles.errorButton}
          focusable={true}
          hasTVPreferredFocus={true}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ThemedText type="body" style={{ color: Colors.dark.primary }}>
            Go Back
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden translucent backgroundColor="transparent" />
      <AdvancedVideoPlayer
        source={channel.url}
        title={channel.name}
        subtitle={channel.group}
        poster={channel.logo}
        autoPlay={settings.autoPlay}
        drm={getDRMConfig()}
        headers={getStreamHeaders()}
        qualities={DEFAULT_QUALITIES}
        recentChannels={recentChannelObjects}
        onError={handleError}
        onBack={handleBack}
        onNext={() => handleChannelNav("next")}
        onPrevious={() => handleChannelNav("prev")}
        onChannelSelect={handleChannelSelect}
        isFavorite={isFavorite}
        onFavoritePress={handleFavorite}
        isLive={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  errorContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  errorTitle: {
    marginTop: Spacing.md,
    color: "#FFFFFF",
  },
  errorButton: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
  },
});
