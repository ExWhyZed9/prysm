import React, { useState, useRef } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Modal,
  Platform,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { usePlaylist } from "@/context/PlaylistContext";
import { useOrientation } from "@/hooks/useOrientation";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type SetupRouteProp = RouteProp<RootStackParamList, "Setup">;
type SetupNavigationProp = NativeStackNavigationProp<RootStackParamList, "Setup">;

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<SetupNavigationProp>();
  const route = useRoute<SetupRouteProp>();
  const fromSettings = route.params?.fromSettings ?? false;
  const { theme, isDark } = useTheme();
  const { isPortrait, isLandscape, width, height } = useOrientation();
  const { loadPlaylistFromUrl, loadPlaylistFromFile, isLoadingPlaylist, cancelLoading } = usePlaylist();

  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingType, setLoadingType] = useState<"url" | "file" | null>(null);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState("");
  const abortRef = useRef(false);
  const [isCloseFocused, setIsCloseFocused] = useState(false);
  const [isFileFocused, setIsFileFocused] = useState(false);
  const [isCancelFocused, setIsCancelFocused] = useState(false);

  const isCompact = height < 500;
  const isTVDevice = Platform.isTV;

  const handleCancelLoading = () => {
    abortRef.current = true;
    cancelLoading();
    setShowLoadingModal(false);
    setLoadingType(null);
    setLoadingProgress("");
  };

  const handleLoadFromUrl = async () => {
    if (!url.trim()) {
      setError("Please enter a valid URL");
      return;
    }

    try {
      setError(null);
      setLoadingType("url");
      setShowLoadingModal(true);
      abortRef.current = false;
      if (!isTVDevice) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setLoadingProgress("Fetching playlist...");

      await loadPlaylistFromUrl(url.trim());
      if (!isTVDevice) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLoadingModal(false);
      if (fromSettings) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load playlist");
      if (!isTVDevice) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowLoadingModal(false);
    } finally {
      setLoadingType(null);
    }
  };

  const handleLoadFromFile = async () => {
    try {
      setError(null);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/x-mpegurl", "audio/x-mpegurl", "audio/mpegurl", "application/vnd.apple.mpegurl"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      setLoadingType("file");
      setShowLoadingModal(true);
      setLoadingProgress("Parsing playlist file...");
      abortRef.current = false;
      if (!isTVDevice) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const content = await FileSystem.readAsStringAsync(file.uri);
      const fileName = file.name.replace(/\.(m3u8?|txt)$/i, "") || "Playlist";

      await loadPlaylistFromFile(content, fileName);
      if (!isTVDevice) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLoadingModal(false);
      if (fromSettings) {
        navigation.goBack();
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: "Main" }],
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load file");
      if (!isTVDevice) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowLoadingModal(false);
    } finally {
      setLoadingType(null);
    }
  };

  const handleClose = () => {
    if (!isTVDevice) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  };

  return (
    <ThemedView style={styles.container}>
      {fromSettings ? (
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable
            onPress={handleClose}
            onFocus={() => setIsCloseFocused(true)}
            onBlur={() => setIsCloseFocused(false)}
            style={[
              styles.closeButton,
              isCloseFocused && styles.closeButtonFocused,
            ] as ViewStyle[]}
            hitSlop={16}
            focusable={true}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={28} color={theme.text} />
          </Pressable>
          <ThemedText type="h4" style={styles.headerTitle}>Add Playlist</ThemedText>
          <View style={styles.closeButton} />
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: fromSettings ? Spacing.md : insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
            paddingLeft: insets.left + Spacing.lg,
            paddingRight: insets.right + Spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content, isLandscape ? styles.contentWide : styles.contentNarrow]}>
          {!fromSettings ? (
            <View style={[styles.branding, isCompact && styles.brandingCompact]}>
              <View style={[styles.iconContainer, isCompact && styles.iconContainerCompact, { backgroundColor: theme.primary + "20" }]}>
                <Ionicons name="prism" size={isCompact ? 36 : 44} color={theme.primary} />
              </View>
              <ThemedText type={isCompact ? "h2" : "h1"} style={styles.title}>
                Prysm
              </ThemedText>
              {!isCompact ? (
                <ThemedText
                  type="body"
                  style={[styles.subtitle, { color: theme.textSecondary }]}
                >
                  Add your playlist to start watching
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.form, isLandscape ? styles.formWide : styles.formNarrow]}>
              <View style={[styles.inputSection, { maxWidth: isLandscape ? 320 : 400 }]}>
                <ThemedText type="h4" style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>
                  Enter Playlist URL
                </ThemedText>
                <View
                  style={[
                    styles.inputContainer,
                    { backgroundColor: theme.backgroundDefault, borderColor: theme.backgroundSecondary },
                    isCompact && styles.inputContainerCompact,
                  ]}
                >
                  <Ionicons
                    name="link"
                    size={18}
                    color={theme.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={url}
                    onChangeText={setUrl}
                    placeholder="https://example.com/playlist"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="done"
                    onSubmitEditing={handleLoadFromUrl}
                    editable={!isLoadingPlaylist}
                    testID="url-input"
                  />
                </View>

                <Button
                  onPress={handleLoadFromUrl}
                  disabled={isLoadingPlaylist || !url.trim()}
                  style={[styles.button, isCompact && styles.buttonCompact]}
                >
                  {loadingType === "url" ? (
                    <ActivityIndicator size="small" color={theme.buttonText} />
                  ) : (
                    "Load Playlist"
                  )}
                </Button>

                <View style={[styles.dividerContainer, isLandscape ? styles.dividerWide : styles.dividerNarrow]}>
                  <View style={[styles.divider, { backgroundColor: theme.backgroundSecondary }]} />
                  <ThemedText
                    type="small"
                    style={[styles.dividerText, { color: theme.textSecondary }]}
                  >
                    OR
                  </ThemedText>
                  <View style={[styles.divider, { backgroundColor: theme.backgroundSecondary }]} />
                </View>

                <Pressable
                  onPress={handleLoadFromFile}
                  onFocus={() => setIsFileFocused(true)}
                  onBlur={() => setIsFileFocused(false)}
                  disabled={isLoadingPlaylist}
                  focusable={!isLoadingPlaylist}
                  accessibilityLabel="Choose file"
                  accessibilityRole="button"
                  style={[
                    styles.fileButton,
                    { backgroundColor: theme.backgroundDefault, borderColor: theme.primary + "40" },
                    isCompact && styles.fileButtonCompact,
                    isFileFocused && styles.fileButtonFocused,
                  ] as ViewStyle[]}
                  testID="file-picker-btn"
                >
                  {loadingType === "file" ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={22} color={theme.primary} />
                      <ThemedText type="small" style={styles.fileButtonText}>
                        Choose File
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorContainer, { backgroundColor: Colors.dark.error + "20" }]}>
            <Ionicons name="alert-circle" size={14} color={Colors.dark.error} />
            <ThemedText
              type="small"
              style={[styles.errorText, { color: Colors.dark.error }]}
            >
              {error}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={showLoadingModal}
        transparent
        animationType="fade"
      >
        <View style={styles.loadingModal}>
          <View style={[styles.loadingContent, { backgroundColor: theme.backgroundDefault }]}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText type="body" style={styles.loadingText}>
              {loadingProgress}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              This may take a moment for large playlists
            </ThemedText>
            <Pressable
              onPress={handleCancelLoading}
              onFocus={() => setIsCancelFocused(true)}
              onBlur={() => setIsCancelFocused(false)}
              focusable={true}
              accessibilityLabel="Cancel loading"
              accessibilityRole="button"
              style={[
                styles.cancelButton,
                { borderColor: theme.textSecondary + "40" },
                isCancelFocused && styles.cancelButtonFocused,
              ] as ViewStyle[]}
            >
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  contentWide: {
    flexDirection: "row",
    gap: Spacing["4xl"],
  },
  contentNarrow: {
    flexDirection: "column",
    gap: Spacing["2xl"],
  },
  branding: {
    alignItems: "center",
  },
  brandingCompact: {
    marginBottom: 0,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconContainerCompact: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    maxWidth: 260,
  },
  form: {
    alignItems: "center",
  },
  formWide: {
    flexDirection: "column",
    gap: Spacing.lg,
  },
  formNarrow: {
    flexDirection: "column",
    gap: Spacing.lg,
    width: "100%",
    maxWidth: 400,
    paddingHorizontal: Spacing.lg,
  },
  inputSection: {
    width: "100%",
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  sectionTitleCompact: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  inputContainerCompact: {
    height: 40,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  button: {
    height: 44,
  },
  buttonCompact: {
    height: 40,
  },
  dividerContainer: {
    alignItems: "center",
    marginVertical: Spacing.md,
  },
  dividerWide: {
    gap: Spacing.sm,
  },
  dividerNarrow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
  },
  fileButton: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    gap: Spacing.sm,
    minWidth: 120,
  },
  fileButtonFocused: {
    borderColor: Colors.dark.primary,
    borderStyle: "solid",
    backgroundColor: Colors.dark.primary + "15",
    transform: [{ scale: 1.02 }],
  },
  fileButtonCompact: {
    padding: Spacing.md,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  fileButtonText: {
    fontWeight: "600",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.xl,
  },
  errorText: {
    marginLeft: Spacing.sm,
    flex: 0,
    fontSize: 12,
  },
  loadingModal: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  loadingContent: {
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.md,
    minWidth: 200,
  },
  loadingText: {
    marginTop: Spacing.sm,
  },
  cancelButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  cancelButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    textAlign: "center",
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  closeButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
});
