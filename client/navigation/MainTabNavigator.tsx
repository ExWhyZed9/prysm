import React, { useState, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, Dimensions, findNodeHandle, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Device from "expo-device";

import ChannelsScreen from "@/screens/ChannelsScreen";
import FavoritesScreen from "@/screens/FavoritesScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import { ThemedText } from "@/components/ThemedText";
import { useResponsive } from "@/hooks/useResponsive";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const isTV = Platform.isTV;

export type MainTabParamList = {
  Channels: undefined;
  Favorites: undefined;
  Settings: undefined;
};

type ScreenName = "Channels" | "Favorites" | "Settings";

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface SidebarItemProps {
  icon: IoniconsName;
  iconActive: IoniconsName;
  label: string;
  isActive: boolean;
  onPress: () => void;
  compact: boolean;
  hasTVPreferredFocus?: boolean;
  itemRef?: React.RefObject<View | null>;
  nextFocusDown?: React.RefObject<View | null>;
  nextFocusUp?: React.RefObject<View | null>;
}

interface BottomTabItemProps {
  icon: IoniconsName;
  iconActive: IoniconsName;
  label: string;
  isActive: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  itemRef?: React.RefObject<View | null>;
  nextFocusLeft?: React.RefObject<View | null>;
  nextFocusRight?: React.RefObject<View | null>;
}

function SidebarItem({ icon, iconActive, label, isActive, onPress, compact, hasTVPreferredFocus, itemRef, nextFocusDown, nextFocusUp }: SidebarItemProps) {
  const [isFocused, setIsFocused] = useState(false);
  const { theme } = useTheme();

  const tvProps: any = {};
  if (isTV) {
    if (hasTVPreferredFocus) tvProps.hasTVPreferredFocus = true;
    if (nextFocusDown?.current) tvProps.nextFocusDown = findNodeHandle(nextFocusDown.current);
    if (nextFocusUp?.current) tvProps.nextFocusUp = findNodeHandle(nextFocusUp.current);
  }

  return (
    <Pressable
      ref={itemRef}
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      accessibilityLabel={label}
      accessibilityRole="button"
      {...tvProps}
      style={[
        styles.sidebarItem,
        isActive && { backgroundColor: theme.primary + "20" },
        isFocused && { borderWidth: 2, borderColor: theme.primary, backgroundColor: theme.primary + "40", transform: [{ scale: 1.08 }] },
      ] as ViewStyle[]}
    >
      <Ionicons
        name={isActive ? iconActive : icon}
        size={compact ? 22 : 24}
        color={isFocused ? theme.text : isActive ? theme.primary : theme.textSecondary}
      />
      {!compact ? (
        <ThemedText
          type="small"
          style={[
            styles.sidebarLabel,
            { color: isFocused ? theme.text : isActive ? theme.primary : theme.textSecondary },
          ]}
        >
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function BottomTabItem({ icon, iconActive, label, isActive, onPress, hasTVPreferredFocus, itemRef, nextFocusLeft, nextFocusRight }: BottomTabItemProps) {
  const [isFocused, setIsFocused] = useState(false);
  const { theme } = useTheme();

  const tvProps: any = {};
  if (isTV) {
    if (hasTVPreferredFocus) tvProps.hasTVPreferredFocus = true;
    if (nextFocusLeft?.current) tvProps.nextFocusLeft = findNodeHandle(nextFocusLeft.current);
    if (nextFocusRight?.current) tvProps.nextFocusRight = findNodeHandle(nextFocusRight.current);
  }

  return (
    <Pressable
      ref={itemRef}
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      accessibilityLabel={label}
      accessibilityRole="button"
      {...tvProps}
      style={[
        styles.bottomTabItem,
        isFocused && { borderWidth: 2, borderColor: theme.primary, borderRadius: BorderRadius.sm, backgroundColor: theme.primary + "40", transform: [{ scale: 1.08 }] },
      ] as ViewStyle[]}
    >
      <Ionicons
        name={isActive ? iconActive : icon}
        size={24}
        color={isFocused ? theme.text : isActive ? theme.primary : theme.textSecondary}
      />
      <ThemedText
        type="caption"
        style={[
          styles.bottomTabLabel,
          { color: isFocused ? theme.text : isActive ? theme.primary : theme.textSecondary },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const { sidebarWidth, isExtraWide } = useResponsive();
  const { theme } = useTheme();
  const [currentScreen, setCurrentScreen] = useState<ScreenName>("Channels");

  const channelsRef = useRef<View>(null);
  const favoritesRef = useRef<View>(null);
  const settingsRef = useRef<View>(null);

  const { width, height } = Dimensions.get("window");
  const isTVDevice = Platform.isTV || Device.deviceType === Device.DeviceType.TV;
  const isLandscape = width > height;
  const useSidebar = isLandscape || isTVDevice;
  const compact = sidebarWidth < 90 || isExtraWide;

  const handleScreenChange = useCallback((screen: ScreenName) => {
    setCurrentScreen(screen);
  }, []);

  const renderScreen = () => {
    switch (currentScreen) {
      case "Channels":
        return <ChannelsScreen />;
      case "Favorites":
        return <FavoritesScreen />;
      case "Settings":
        return <SettingsScreen />;
      default:
        return <ChannelsScreen />;
    }
  };

  if (useSidebar) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View
          style={[
            styles.sidebar,
            {
              width: sidebarWidth,
              paddingTop: insets.top + Spacing.md,
              paddingBottom: insets.bottom + Spacing.md,
              paddingLeft: insets.left + Spacing.xs,
              backgroundColor: theme.backgroundDefault,
            },
          ]}
        >
          <View style={styles.sidebarHeader}>
            <Ionicons name="tv" size={compact ? 26 : 30} color={theme.primary} />
            {!compact ? (
              <ThemedText type="h4" style={[styles.sidebarTitle, { color: theme.primary }]}>
                IPTV
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.sidebarNav}>
            <SidebarItem
              icon="grid-outline"
              iconActive="grid"
              label="Channels"
              isActive={currentScreen === "Channels"}
              onPress={() => handleScreenChange("Channels")}
              compact={compact}
              hasTVPreferredFocus={currentScreen === "Channels"}
              itemRef={channelsRef}
              nextFocusDown={favoritesRef}
            />
            <SidebarItem
              icon="star-outline"
              iconActive="star"
              label="Favorites"
              isActive={currentScreen === "Favorites"}
              onPress={() => handleScreenChange("Favorites")}
              compact={compact}
              itemRef={favoritesRef}
              nextFocusUp={channelsRef}
              nextFocusDown={settingsRef}
            />
            <SidebarItem
              icon="settings-outline"
              iconActive="settings"
              label="Settings"
              isActive={currentScreen === "Settings"}
              onPress={() => handleScreenChange("Settings")}
              compact={compact}
              itemRef={settingsRef}
              nextFocusUp={favoritesRef}
            />
          </View>
        </View>

        <View style={styles.content}>{renderScreen()}</View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { flexDirection: "column", backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.content, { paddingBottom: 60 + insets.bottom }]}>
        {renderScreen()}
      </View>

      <View
        style={[
          styles.bottomTabBar,
          {
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            backgroundColor: theme.backgroundDefault,
            borderTopColor: theme.backgroundSecondary,
          },
        ]}
      >
        <BottomTabItem
          icon="grid-outline"
          iconActive="grid"
          label="Channels"
          isActive={currentScreen === "Channels"}
          onPress={() => handleScreenChange("Channels")}
          hasTVPreferredFocus={currentScreen === "Channels"}
          itemRef={channelsRef}
          nextFocusRight={favoritesRef}
        />
        <BottomTabItem
          icon="star-outline"
          iconActive="star"
          label="Favorites"
          isActive={currentScreen === "Favorites"}
          onPress={() => handleScreenChange("Favorites")}
          itemRef={favoritesRef}
          nextFocusLeft={channelsRef}
          nextFocusRight={settingsRef}
        />
        <BottomTabItem
          icon="settings-outline"
          iconActive="settings"
          label="Settings"
          isActive={currentScreen === "Settings"}
          onPress={() => handleScreenChange("Settings")}
          itemRef={settingsRef}
          nextFocusLeft={favoritesRef}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    paddingHorizontal: Spacing.xs,
  },
  sidebarHeader: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  sidebarTitle: {
    marginTop: Spacing.sm,
    fontWeight: "700",
  },
  sidebarNav: {
    flex: 1,
    gap: Spacing.xs,
  },
  sidebarItem: {
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  sidebarLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  content: {
    flex: 1,
  },
  bottomTabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  bottomTabLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
});
