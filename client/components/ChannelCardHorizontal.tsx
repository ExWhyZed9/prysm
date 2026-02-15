import React, { useState, useCallback } from "react";
import { StyleSheet, View, Pressable, Platform, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Channel } from "@/types/playlist";
import { TextSizeOption } from "@/lib/storage";

const isTV = Platform.isTV;

interface ChannelCardHorizontalProps {
  channel: Channel;
  isFavorite: boolean;
  onPress: () => void;
  onFavoritePress: () => void;
  cardWidth: number;
  isUltraWide: boolean;
  textSize: TextSizeOption;
  themeBackground: string;
  themeTextSecondary: string;
}

const placeholderImage = require("../../assets/images/placeholder-channel.png");

const getTextStyles = (textSize: TextSizeOption) => {
  switch (textSize) {
    case "small":
      return { name: 9, nameLine: 11, label: 7 };
    case "large":
      return { name: 14, nameLine: 18, label: 10 };
    default:
      return { name: 11, nameLine: 14, label: 8 };
  }
};

function ChannelCardHorizontalInner({
  channel,
  isFavorite,
  onPress,
  onFavoritePress,
  cardWidth,
  isUltraWide,
  textSize,
  themeBackground,
  themeTextSecondary,
}: ChannelCardHorizontalProps) {
  const textStyles = getTextStyles(textSize);
  const [isFocused, setIsFocused] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [isFavFocused, setIsFavFocused] = useState(false);

  const handlePress = useCallback(() => {
    onPress();
  }, [onPress]);

  const handleFavorite = useCallback(
    (e: any) => {
      e.stopPropagation();
      onFavoritePress();
    },
    [onFavoritePress]
  );

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  const handleLogoError = useCallback(() => setLogoError(true), []);

  const logoHeight = isUltraWide ? cardWidth * 0.5 : cardWidth * 0.55;
  const logoSize = isUltraWide ? cardWidth * 0.35 : cardWidth * 0.4;
  const isCompact = cardWidth < 140;

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
          width: cardWidth - 4,
          margin: 2,
          borderColor: isFocused ? Colors.dark.primary : "transparent",
          transform: isFocused ? [{ scale: 1.03 }] : undefined,
        },
      ]}
      testID={`channel-card-${channel.id}`}
    >
      <View style={[styles.logoContainer, { height: logoHeight }]}>
        <Image
          source={
            channel.logo && !logoError
              ? { uri: channel.logo }
              : placeholderImage
          }
          style={[styles.logo, { width: logoSize, height: logoSize }]}
          contentFit="contain"
          placeholder={placeholderImage}
          placeholderContentFit="contain"
          recyclingKey={channel.id}
          cachePolicy="memory-disk"
          onError={handleLogoError}
        />
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
            size={isUltraWide ? 14 : 16}
            color={
              isFavorite ? Colors.dark.primary : "rgba(255,255,255,0.5)"
            }
          />
        </Pressable>
      </View>
      <View style={[styles.info, isCompact && styles.infoCompact]}>
        <ThemedText
          type="small"
          numberOfLines={2}
          style={[
            styles.name,
            {
              fontSize: textStyles.name,
              lineHeight: textStyles.nameLine,
            },
          ]}
        >
          {channel.name}
        </ThemedText>
        <View style={styles.liveIndicator}>
          <View
            style={[styles.liveDot, isCompact && styles.liveDotCompact]}
          />
          <ThemedText
            type="caption"
            style={[
              styles.category,
              { fontSize: textStyles.label, color: themeTextSecondary },
            ]}
            numberOfLines={1}
          >
            LIVE
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export const ChannelCardHorizontal = React.memo(
  ChannelCardHorizontalInner,
  (prev, next) =>
    prev.channel.id === next.channel.id &&
    prev.isFavorite === next.isFavorite &&
    prev.cardWidth === next.cardWidth &&
    prev.isUltraWide === next.isUltraWide &&
    prev.textSize === next.textSize &&
    prev.themeBackground === next.themeBackground &&
    prev.onPress === next.onPress &&
    prev.onFavoritePress === next.onFavoritePress
);

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  logoContainer: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  logo: {},
  favoriteButton: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  favoriteButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(0,0,0,0.8)",
    transform: [{ scale: 1.2 }],
  },
  info: {
    padding: Spacing.sm,
  },
  infoCompact: {
    padding: Spacing.xs,
  },
  name: {
    fontWeight: "600",
    marginBottom: 2,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.dark.success,
    marginRight: Spacing.xs,
  },
  liveDotCompact: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  category: {
    fontWeight: "600",
  },
});
