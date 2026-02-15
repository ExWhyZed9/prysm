import React, { useState, useCallback } from "react";
import { StyleSheet, View, Pressable, Platform, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Channel } from "@/types/playlist";

interface ChannelCardProps {
  channel: Channel;
  isFavorite: boolean;
  onPress: () => void;
  onFavoritePress: () => void;
  themeBackground: string;
  themeTextSecondary: string;
}

const placeholderImage = require("../../assets/images/placeholder-channel.png");

const isTV = Platform.isTV;

function ChannelCardInner({
  channel,
  isFavorite,
  onPress,
  onFavoritePress,
  themeBackground,
  themeTextSecondary,
}: ChannelCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [isFavFocused, setIsFavFocused] = useState(false);

  const handlePress = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  const handleFavorite = useCallback(() => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFavoritePress();
  }, [onFavoritePress]);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  const handleLogoError = useCallback(() => setLogoError(true), []);

  return (
    <Pressable
      onPress={handlePress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      focusable={true}
      style={[
        styles.card,
        {
          backgroundColor: isFocused
            ? Colors.dark.primary + "20"
            : themeBackground,
          borderColor: isFocused ? Colors.dark.primary : "transparent",
          transform: isFocused ? [{ scale: 1.03 }] : undefined,
        },
      ]}
      testID={`channel-card-${channel.id}`}
    >
      <View style={styles.logoContainer}>
        <Image
          source={
            channel.logo && !logoError
              ? { uri: channel.logo }
              : placeholderImage
          }
          style={styles.logo}
          contentFit="contain"
          placeholder={placeholderImage}
          placeholderContentFit="contain"
          recyclingKey={channel.id}
          cachePolicy="memory-disk"
          onError={handleLogoError}
        />
      </View>
      <View style={styles.info}>
        <ThemedText type="small" numberOfLines={2} style={styles.name}>
          {channel.name}
        </ThemedText>
        <ThemedText
          type="small"
          style={[styles.category, { color: themeTextSecondary }]}
          numberOfLines={1}
        >
          {channel.group}
        </ThemedText>
      </View>
      <Pressable
        onPress={handleFavorite}
        onFocus={() => setIsFavFocused(true)}
        onBlur={() => setIsFavFocused(false)}
        style={[
          styles.favoriteButton,
          isFavFocused && styles.favoriteButtonFocused,
        ] as ViewStyle[]}
        hitSlop={8}
        focusable={true}
        accessibilityLabel={
          isFavorite ? "Remove from favorites" : "Add to favorites"
        }
        accessibilityRole="button"
        testID={`favorite-btn-${channel.id}`}
      >
        <Ionicons
          name={isFavorite ? "star" : "star-outline"}
          size={18}
          color={isFavorite ? Colors.dark.primary : themeTextSecondary}
          style={{ opacity: isFavorite ? 1 : 0.5 }}
        />
      </Pressable>
    </Pressable>
  );
}

export const ChannelCard = React.memo(
  ChannelCardInner,
  (prev, next) =>
    prev.channel.id === next.channel.id &&
    prev.isFavorite === next.isFavorite &&
    prev.themeBackground === next.themeBackground &&
    prev.onPress === next.onPress &&
    prev.onFavoritePress === next.onFavoritePress
);

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  logoContainer: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  logo: {
    width: 40,
    height: 40,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  name: {
    fontWeight: "600",
  },
  category: {
    marginTop: 2,
    fontSize: 12,
  },
  favoriteButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  favoriteButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
});
