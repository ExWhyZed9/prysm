import React, { useCallback, useEffect } from "react";
import { View, StatusBar, Pressable, StyleSheet, Platform } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import {
  AdvancedVideoPlayer,
  DRMConfig,
} from "@/components/AdvancedVideoPlayer";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { USER_AGENT_STRINGS, UserAgent } from "@/lib/storage";

const isTV = Platform.isTV;

type NetworkPlayerRouteProp = RouteProp<RootStackParamList, "NetworkPlayer">;
type NetworkPlayerNavProp = NativeStackNavigationProp<
  RootStackParamList,
  "NetworkPlayer"
>;

let NavigationBarModule: any = null;

async function loadNavBar() {
  if (Platform.OS === "android" && !NavigationBarModule) {
    try {
      NavigationBarModule = require("expo-navigation-bar");
    } catch {}
  }
}

async function hideNavBar() {
  if (Platform.OS === "android" && NavigationBarModule) {
    try {
      await NavigationBarModule.setVisibilityAsync("hidden");
      await NavigationBarModule.setBehaviorAsync("overlay-swipe");
    } catch {}
  }
}

async function showNavBar() {
  if (Platform.OS === "android" && NavigationBarModule) {
    try {
      await NavigationBarModule.setVisibilityAsync("visible");
    } catch {}
  }
}

export default function NetworkPlayerScreen() {
  const navigation = useNavigation<NetworkPlayerNavProp>();
  const route = useRoute<NetworkPlayerRouteProp>();
  const { config } = route.params;

  useEffect(() => {
    loadNavBar().then(() => hideNavBar());
    return () => {
      showNavBar();
    };
  }, []);

  const handleBack = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  }, [navigation]);

  const handleError = useCallback((error: string) => {
    console.error("Network stream error:", error);
  }, []);

  /** Build DRMConfig only when a license URL / key is provided */
  const drm: DRMConfig | undefined = config.drmLicenseUrl.trim()
    ? {
        type:
          config.drmScheme === "widevine"
            ? "widevine"
            : config.drmScheme === "playready"
              ? "playready"
              : "clearkey",
        licenseServer: config.drmLicenseUrl.trim(),
      }
    : undefined;

  /** Build request headers from cookie / referer / origin / user-agent */
  const headers: Record<string, string> = {};
  if (config.cookie.trim()) headers["Cookie"] = config.cookie.trim();
  if (config.referer.trim()) headers["Referer"] = config.referer.trim();
  if (config.origin.trim()) headers["Origin"] = config.origin.trim();

  const uaString =
    config.userAgent === "custom"
      ? config.customUserAgent.trim()
      : USER_AGENT_STRINGS[config.userAgent as UserAgent];
  if (uaString) headers["User-Agent"] = uaString;

  if (!config.url.trim()) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar hidden />
        <Ionicons name="alert-circle" size={40} color={Colors.dark.error} />
        <ThemedText type="h4" style={styles.errorTitle}>
          No Stream URL
        </ThemedText>
        <ThemedText type="body" style={styles.errorSub}>
          Go back and enter a Media Stream URL.
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
        source={config.url.trim()}
        title="Network Stream"
        autoPlay={true}
        drm={drm}
        headers={Object.keys(headers).length > 0 ? headers : undefined}
        onError={handleError}
        onBack={handleBack}
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
  center: {
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  errorTitle: {
    marginTop: Spacing.md,
    color: "#FFFFFF",
  },
  errorSub: {
    marginTop: Spacing.sm,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  errorButton: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
  },
});
