import { View, type ViewProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  ...otherProps
}: ThemedViewProps) {
  const { theme, isDark } = useTheme();
  
  const backgroundColor = isDark
    ? (darkColor || theme.backgroundRoot)
    : (lightColor || theme.backgroundRoot);

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
