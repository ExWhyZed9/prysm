import React, { useState } from "react";
import { StyleSheet, View, Pressable, Switch, Platform, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const isTV = Platform.isTV;

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface SettingsRowProps {
  icon: IoniconsName;
  title: string;
  subtitle?: string;
  value?: string;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  isToggle,
  toggleValue,
  onToggle,
  onPress,
  showChevron = false,
  destructive = false,
}: SettingsRowProps) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const content = (
    <View style={styles.container}>
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: destructive
              ? Colors.dark.error + "20"
              : Colors.dark.primary + "20",
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? Colors.dark.error : Colors.dark.primary}
        />
      </View>
      <View style={styles.content}>
        <ThemedText
          type="body"
          style={[
            styles.title,
            { color: destructive ? Colors.dark.error : isFocused ? "#FFFFFF" : theme.text },
          ]}
          numberOfLines={1}
        >
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            type="small"
            style={[styles.subtitle, { color: isFocused ? Colors.dark.primary : theme.textSecondary }]}
            numberOfLines={2}
          >
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{
            false: theme.backgroundTertiary,
            true: Colors.dark.primary,
          }}
          thumbColor="#FFFFFF"
          testID={`toggle-${title.toLowerCase().replace(/\s/g, "-")}`}
        />
      ) : null}
      {value ? (
        <ThemedText
          type="small"
          style={[styles.value, { color: isFocused ? "#FFFFFF" : theme.textSecondary }]}
          numberOfLines={1}
        >
          {value}
        </ThemedText>
      ) : null}
      {showChevron ? (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isFocused ? Colors.dark.primary : theme.textSecondary}
          style={styles.chevron}
        />
      ) : null}
    </View>
  );

  if (onPress || isToggle) {
    return (
      <Pressable
        onPress={onPress || (isToggle ? () => onToggle?.(!toggleValue) : undefined)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        focusable={true}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[
          styles.pressable,
          { backgroundColor: theme.backgroundDefault },
          isFocused && styles.pressableFocused,
        ] as ViewStyle[]}
        testID={`settings-row-${title.toLowerCase().replace(/\s/g, "-")}`}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.pressable, { backgroundColor: theme.backgroundDefault }]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  pressableFocused: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "30",
    transform: [{ scale: 1.02 }],
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  title: {
    fontWeight: "500",
  },
  subtitle: {
    marginTop: 2,
  },
  value: {
    marginRight: Spacing.sm,
  },
  chevron: {
    marginLeft: Spacing.sm,
  },
});
