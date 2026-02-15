import React, { useState } from "react";
import { StyleSheet, Pressable, View, useWindowDimensions, Platform, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

interface CategoryChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  count?: number;
  isFavorite?: boolean;
  onFavoritePress?: () => void;
  showFavoriteButton?: boolean;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CategoryChip({
  label,
  isActive,
  onPress,
  count,
  isFavorite = false,
  onFavoritePress,
  showFavoriteButton = false,
}: CategoryChipProps) {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const [isFocused, setIsFocused] = useState(false);

  const isCompact = height < 500;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  const handlePress = () => {
    if (!Platform.isTV) Haptics.selectionAsync();
    onPress();
  };

  const handleFavoritePress = () => {
    if (!Platform.isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFavoritePress?.();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      style={[
        styles.chip,
        isCompact && styles.chipCompact,
        {
          backgroundColor: isActive
            ? Colors.dark.primary
            : theme.backgroundSecondary,
          borderColor: isFocused ? Colors.dark.primary : isActive ? Colors.dark.primary : isFavorite ? Colors.dark.primary + "60" : "transparent",
        },
        isFocused && {
          borderColor: Colors.dark.primary,
          borderWidth: 2,
          backgroundColor: Colors.dark.primary + "30",
          transform: [{ scale: 1.08 }],
        },
        animatedStyle,
      ] as ViewStyle[]}
      testID={`category-chip-${label}`}
    >
      {isFavorite && !isActive ? (
        <Ionicons
          name="star"
          size={isCompact ? 10 : 12}
          color={Colors.dark.primary}
          style={styles.favoriteIcon}
        />
      ) : null}
      <ThemedText
        type="small"
        style={[
          styles.label,
          isCompact && styles.labelCompact,
          {
            color: isActive ? theme.buttonText : theme.text,
          },
        ]}
      >
        {label}
      </ThemedText>
      {count !== undefined && count > 0 ? (
        <ThemedText
          type="small"
          style={[
            styles.count,
            isCompact && styles.countCompact,
            {
              color: isActive ? theme.buttonText : theme.textSecondary,
            },
          ]}
        >
          {count}
        </ThemedText>
      ) : null}
      {showFavoriteButton && label !== "All" ? (
        <Pressable
          onPress={handleFavoritePress}
          hitSlop={8}
          style={styles.favoriteButton}
        >
          <Ionicons
            name={isFavorite ? "star" : "star-outline"}
            size={isCompact ? 12 : 14}
            color={isFavorite ? Colors.dark.primary : isActive ? theme.buttonText : theme.textSecondary}
          />
        </Pressable>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    borderWidth: 1,
  },
  chipCompact: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginRight: Spacing.xs,
  },
  label: {
    fontWeight: "600",
    fontSize: 13,
  },
  labelCompact: {
    fontSize: 11,
  },
  count: {
    marginLeft: Spacing.xs,
    fontSize: 11,
    opacity: 0.7,
  },
  countCompact: {
    fontSize: 10,
  },
  favoriteIcon: {
    marginRight: 4,
  },
  favoriteButton: {
    marginLeft: Spacing.xs,
    padding: 2,
  },
});
