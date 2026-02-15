import React from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing } from "@/constants/theme";

interface LoadingOverlayProps {
  message?: string;
  visible: boolean;
}

export function LoadingOverlay({
  message = "Loading...",
  visible,
}: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText type="body" style={styles.message}>
          {message}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  content: {
    alignItems: "center",
  },
  message: {
    marginTop: Spacing.lg,
  },
});
