import React, { ReactNode, useState } from "react";
import { StyleSheet, Pressable, ViewStyle, StyleProp, ActivityIndicator, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Colors, BorderRadius, Spacing } from "@/constants/theme";

const isTV = Platform.isTV;

interface ButtonProps {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
  hasTVPreferredFocus?: boolean;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
  energyThreshold: 0.001,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  onPress,
  children,
  style,
  disabled = false,
  loading = false,
  variant = "primary",
  hasTVPreferredFocus,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const [isFocused, setIsFocused] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.96, springConfig);
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(1, springConfig);
    }
  };

  const isDisabled = disabled || loading;

  const tvProps: any = {};
  if (isTV && hasTVPreferredFocus) {
    tvProps.hasTVPreferredFocus = true;
  }

  return (
    <AnimatedPressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      disabled={isDisabled}
      focusable={!isDisabled}
      accessibilityRole="button"
      {...tvProps}
      style={[
        styles.button,
        {
          backgroundColor:
            variant === "primary"
              ? Colors.dark.primary
              : Colors.dark.backgroundSecondary,
          opacity: isDisabled ? 0.5 : 1,
        },
        isFocused && styles.buttonFocused,
        style,
        animatedStyle,
      ] as ViewStyle[]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? Colors.dark.buttonText : Colors.dark.text}
        />
      ) : (
        <ThemedText
          type="body"
          style={[
            styles.buttonText,
            {
              color:
                variant === "primary" ? Colors.dark.buttonText : Colors.dark.text,
            },
          ]}
        >
          {children}
        </ThemedText>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonFocused: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    transform: [{ scale: 1.05 }],
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    fontWeight: "600",
    fontFamily: "Rubik_600SemiBold",
  },
});
