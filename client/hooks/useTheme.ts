import { useThemeContext } from "@/context/ThemeContext";

export function useTheme() {
  const { theme, isDark, themeMode, setThemeMode, toggleTheme } = useThemeContext();

  return {
    theme,
    isDark,
    themeMode,
    setThemeMode,
    toggleTheme,
  };
}
