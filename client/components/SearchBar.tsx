import React, { useState } from "react";
import { StyleSheet, View, TextInput, Pressable, Platform, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const isTV = Platform.isTV;

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search channels...",
  onClear,
}: SearchBarProps) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isClearFocused, setIsClearFocused] = useState(false);

  const handleClear = () => {
    onChangeText("");
    onClear?.();
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundSecondary },
        isFocused && styles.containerFocused,
      ]}
    >
      <Ionicons
        name="search"
        size={20}
        color={isFocused ? Colors.dark.primary : theme.textSecondary}
        style={styles.icon}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        testID="search-input"
        accessibilityRole="search"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={handleClear}
          onFocus={() => setIsClearFocused(true)}
          onBlur={() => setIsClearFocused(false)}
          hitSlop={8}
          focusable={true}
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          style={[
            styles.clearButton,
            isClearFocused && styles.clearButtonFocused,
          ] as ViewStyle[]}
          testID="search-clear"
        >
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    borderWidth: 2,
    borderColor: "transparent",
  },
  containerFocused: {
    borderColor: Colors.dark.primary,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    borderRadius: BorderRadius.xs,
  },
  clearButtonFocused: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
});
