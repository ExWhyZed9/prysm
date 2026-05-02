import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  useWindowDimensions,
  Platform,
  ViewStyle,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as IntentLauncher from "expo-intent-launcher";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { SettingsRow } from "@/components/SettingsRow";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { usePlaylist } from "@/context/PlaylistContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import {
  checkForUpdate,
  downloadApk,
  getDownloadedApkPath,
  UpdateInfo,
} from "@/utils/updateChecker";

type SettingsNavigationProp = NativeStackNavigationProp<RootStackParamList>;

function FocusableOption({
  onPress,
  isSelected,
  style,
  children,
  accessibilityLabel,
  hasTVPreferredFocus,
}: {
  onPress: () => void;
  isSelected?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
  accessibilityLabel?: string;
  hasTVPreferredFocus?: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const tvProps: any = {};
  if (hasTVPreferredFocus) tvProps.hasTVPreferredFocus = true;
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...tvProps}
      style={
        [
          styles.modalOption,
          isSelected
            ? { backgroundColor: Colors.dark.primary + "20" }
            : { backgroundColor: "transparent" },
          style,
          isFocused && styles.modalOptionFocused,
        ] as ViewStyle[]
      }
    >
      {children}
    </Pressable>
  );
}

function FocusablePressable({
  onPress,
  baseStyle,
  focusedStyle,
  children,
  hitSlop,
  accessibilityLabel,
  hasTVPreferredFocus,
}: {
  onPress: () => void;
  baseStyle: ViewStyle | ViewStyle[];
  focusedStyle: ViewStyle;
  children: React.ReactNode;
  hitSlop?: number;
  accessibilityLabel?: string;
  hasTVPreferredFocus?: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const tvProps: any = {};
  if (hasTVPreferredFocus) tvProps.hasTVPreferredFocus = true;
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      {...tvProps}
      style={
        [
          ...(Array.isArray(baseStyle) ? baseStyle : [baseStyle]),
          isFocused && focusedStyle,
        ] as ViewStyle[]
      }
    >
      {children}
    </Pressable>
  );
}

const VIDEO_QUALITY_OPTIONS = [
  { label: "Auto", value: "auto" as const },
  { label: "High", value: "high" as const },
  { label: "Medium", value: "medium" as const },
  { label: "Low", value: "low" as const },
];

const AUTO_REFRESH_OPTIONS = [
  { label: "Off", value: "off" as const },
  { label: "Every 5 minutes", value: "5min" as const },
  { label: "Every 15 minutes", value: "15min" as const },
  { label: "Every day", value: "1day" as const },
];

const TEXT_SIZE_OPTIONS = [
  { label: "Small", value: "small" as const },
  { label: "Medium", value: "medium" as const },
  { label: "Large", value: "large" as const },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<SettingsNavigationProp>();
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const { width } = useWindowDimensions();
  const { isUltraWide } = useResponsive();

  const {
    playlist,
    playlists,
    activePlaylistId,
    settings,
    updateSettings,
    updatePlaylistInfo,
    switchPlaylist,
    deletePlaylist,
    clearAllData,
    isLoadingPlaylist,
    refreshPlaylist,
  } = usePlaylist();

  const [showQualityModal, setShowQualityModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showAutoRefreshModal, setShowAutoRefreshModal] = useState(false);
  const [showTextSizeModal, setShowTextSizeModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showDeletePlaylistModal, setShowDeletePlaylistModal] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showEditPlaylistModal, setShowEditPlaylistModal] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState<string | null>(null);
  const [playlistToEdit, setPlaylistToEdit] = useState<string | null>(null);
  const [editPlaylistName, setEditPlaylistName] = useState("");
  const [editPlaylistUrl, setEditPlaylistUrl] = useState("");

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [installingApk, setInstallingApk] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isTV = Platform.isTV;
  const useColumns = width > 700;
  // On TV and very wide screens show two columns of settings side by side
  const useTwoColumns = isTV || width > 900;

  useEffect(() => {
    const initializeUpdateCheck = async () => {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
      }
    };
    initializeUpdateCheck();
  }, []);

  const handleToggleAutoPlay = (value: boolean) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ autoPlay: value });
  };

  const handleToggleCategories = (value: boolean) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ showCategoryFilter: value });
  };

  const handleToggleRememberCategory = (value: boolean) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ rememberLastCategory: value });
  };

  const handleRefreshPlaylist = async () => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await refreshPlaylist();
  };

  const handleQualitySelect = (value: typeof settings.videoQuality) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ videoQuality: value });
    setShowQualityModal(false);
  };

  const handleAutoRefreshSelect = (
    value: typeof settings.autoRefreshInterval,
  ) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ autoRefreshInterval: value });
    setShowAutoRefreshModal(false);
  };

  const handleTextSizeSelect = (value: typeof settings.textSize) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ textSize: value });
    setShowTextSizeModal(false);
  };

  const getTextSizeLabel = () => {
    const option = TEXT_SIZE_OPTIONS.find((o) => o.value === settings.textSize);
    return option?.label || "Medium";
  };

  const handleThemeSelect = async (value: "light" | "dark") => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setThemeMode(value);
    setShowThemeModal(false);
  };

  const handlePlaylistSelect = async (playlistId: string) => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await switchPlaylist(playlistId);
    setShowPlaylistModal(false);
  };

  const handleDeletePlaylist = async () => {
    if (playlistToDelete) {
      if (!isTV)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deletePlaylist(playlistToDelete);
      setPlaylistToDelete(null);
      setShowDeletePlaylistModal(false);
    }
  };

  const handleClearAllData = async () => {
    if (!isTV)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await clearAllData();
    setShowClearAllConfirm(false);
  };

  const handleAddPlaylist = () => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Setup", { fromSettings: true });
  };

  const handleEditPlaylist = (playlistId: string) => {
    const playlistInfo = playlists.find((p) => p.id === playlistId);
    if (playlistInfo) {
      setPlaylistToEdit(playlistId);
      setEditPlaylistName(playlistInfo.name);
      setEditPlaylistUrl(playlistInfo.url || "");
      setShowPlaylistModal(false);
      setShowEditPlaylistModal(true);
    }
  };

  const handleSaveEditPlaylist = async () => {
    if (playlistToEdit && editPlaylistName.trim()) {
      try {
        if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await updatePlaylistInfo(
          playlistToEdit,
          editPlaylistName.trim(),
          editPlaylistUrl.trim() || undefined,
        );
        setShowEditPlaylistModal(false);
        setPlaylistToEdit(null);
        setEditPlaylistName("");
        setEditPlaylistUrl("");
      } catch (err) {
        console.error("Failed to update playlist:", err);
      }
    }
  };

  const handleCheckForUpdate = async () => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckingForUpdate(true);
    setUpdateError(null);
    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
        if (!info.available) {
          Alert.alert("Up to Date", "You are already on the latest version.");
        }
      } else {
        setUpdateError("Unable to check for updates");
      }
    } catch (error) {
      setUpdateError("Failed to check for updates");
    } finally {
      setCheckingForUpdate(false);
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!updateInfo?.apkUrl) return;
    if (!isTV)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDownloadingApk(true);
    setDownloadProgress(0);
    setUpdateError(null);
    try {
      const apkPath = await downloadApk(updateInfo.apkUrl, (progress) => {
        setDownloadProgress(Math.round(progress * 100));
      });
      if (!apkPath) {
        setUpdateError("Failed to download update");
        return;
      }
      setDownloadingApk(false);
      setInstallingApk(true);
      await IntentLauncher.startActivityAsync(
        "android.intent.action.INSTALL_PACKAGE",
        {
          data: apkPath,
          flags: 1,
        },
      );
    } catch (error) {
      console.error("Error installing update:", error);
      setUpdateError("Failed to install update");
    } finally {
      setDownloadingApk(false);
      setInstallingApk(false);
    }
  };

  const handleOpenUpdateModal = () => {
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUpdateError(null);
    setDownloadProgress(0);
    setShowUpdateModal(true);
  };

  const getQualityLabel = () => {
    const option = VIDEO_QUALITY_OPTIONS.find(
      (o) => o.value === settings.videoQuality,
    );
    return option?.label || "Auto";
  };

  const getAutoRefreshLabel = () => {
    const option = AUTO_REFRESH_OPTIONS.find(
      (o) => o.value === settings.autoRefreshInterval,
    );
    return option?.label || "Off";
  };

  const getThemeLabel = () => {
    return themeMode === "dark" ? "Dark" : "Light";
  };

  const getActivePlaylistName = () => {
    const active = playlists.find((p) => p.id === activePlaylistId);
    return active?.name || "None";
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: insets.bottom + Spacing.md,
            paddingLeft: insets.left + Spacing.md,
            paddingRight: insets.right + Spacing.md,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={
            useTwoColumns ? styles.twoColumnLayout : styles.singleColumnLayout
          }
        >
          {/* ── Left / only column ─────────────────────────────────── */}
          <View style={useTwoColumns ? styles.twoColumnItem : styles.fullWidth}>
            <ThemedText
              type="small"
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              PLAYLISTS
            </ThemedText>
            <View style={styles.section}>
              <SettingsRow
                icon="list"
                title="Active Playlist"
                subtitle={
                  playlist
                    ? `${playlist.channels.length} channels`
                    : "No playlist loaded"
                }
                value={getActivePlaylistName()}
                onPress={() => setShowPlaylistModal(true)}
                showChevron
              />
              {playlists.length > 0 ? (
                <SettingsRow
                  icon="albums"
                  title="Manage Playlists"
                  subtitle={`${playlists.length} playlist${playlists.length > 1 ? "s" : ""} saved`}
                  onPress={() => setShowPlaylistModal(true)}
                  showChevron
                />
              ) : null}
              <SettingsRow
                icon="add-circle"
                title="Add Playlist"
                subtitle="Add M3U URL or file"
                onPress={handleAddPlaylist}
                showChevron
              />
              <SettingsRow
                icon="refresh"
                title="Auto-Refresh"
                subtitle="Automatically update playlist"
                value={getAutoRefreshLabel()}
                onPress={() => setShowAutoRefreshModal(true)}
                showChevron
              />
              <SettingsRow
                icon="refresh-circle"
                title="Refresh Playlist Now"
                subtitle={
                  playlist?.url
                    ? (() => {
                        try {
                          return `Re-fetch from ${new URL(playlist.url).hostname}`;
                        } catch {
                          return "Re-fetch from source";
                        }
                      })()
                    : "No URL configured"
                }
                onPress={handleRefreshPlaylist}
                disabled={!playlist?.url || isLoadingPlaylist}
                rightComponent={
                  isLoadingPlaylist ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : undefined
                }
              />
            </View>

            <ThemedText
              type="small"
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              PLAYBACK
            </ThemedText>
            <View style={styles.section}>
              <SettingsRow
                icon="play"
                title="Auto-play"
                subtitle="Automatically play when opening a channel"
                isToggle
                toggleValue={settings.autoPlay}
                onToggle={handleToggleAutoPlay}
              />
              <SettingsRow
                icon="options"
                title="Video Quality"
                subtitle="Choose preferred video quality"
                value={getQualityLabel()}
                onPress={() => setShowQualityModal(true)}
                showChevron
              />
            </View>
          </View>

          {/* ── Right column (or continuation on single column) ─────── */}
          <View style={useTwoColumns ? styles.twoColumnItem : styles.fullWidth}>
            <ThemedText
              type="small"
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              APPEARANCE
            </ThemedText>
            <View style={styles.section}>
              <SettingsRow
                icon={isDark ? "moon" : "sunny"}
                title="Theme"
                subtitle="Choose light or dark appearance"
                value={getThemeLabel()}
                onPress={() => setShowThemeModal(true)}
                showChevron
              />
              <SettingsRow
                icon="grid"
                title="Show Categories"
                subtitle="Display category filter on channels screen"
                isToggle
                toggleValue={settings.showCategoryFilter}
                onToggle={handleToggleCategories}
              />
              <SettingsRow
                icon="bookmark"
                title="Remember Category"
                subtitle="Open last viewed category on app restart"
                isToggle
                toggleValue={settings.rememberLastCategory}
                onToggle={handleToggleRememberCategory}
              />
              <SettingsRow
                icon="text"
                title="Text Size"
                subtitle="Adjust channel card text size"
                value={getTextSizeLabel()}
                onPress={() => setShowTextSizeModal(true)}
                showChevron
              />
            </View>

            <ThemedText
              type="small"
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              ADVANCED
            </ThemedText>
            <View style={styles.section}>
              <SettingsRow
                icon="wifi"
                title="Network Stream"
                subtitle="Configure DRM, headers, and user agent"
                onPress={() => navigation.navigate("NetworkStream")}
                showChevron
              />
            </View>

            <ThemedText
              type="small"
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              STORAGE
            </ThemedText>
            <View style={styles.section}>
              <SettingsRow
                icon="server"
                title="Clear All Data"
                subtitle="Free up storage space"
                onPress={() => setShowClearAllConfirm(true)}
                destructive
              />
            </View>

            <ThemedText
              type="small"
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              ABOUT
            </ThemedText>
            <View style={styles.section}>
              <SettingsRow
                icon="prism"
                title="Prysm"
                subtitle="Version 1.3.1"
                value=""
              />
              <SettingsRow
                icon="code-slash"
                title="Developer"
                subtitle="ExWhyZed9"
                value=""
                onPress={() => Linking.openURL("https://github.com/ExWhyZed9")}
                showChevron
              />
              {updateInfo?.available ? (
                <SettingsRow
                  icon="download"
                  title="Update Available"
                  subtitle={`Version ${updateInfo.latestVersion} ready to install`}
                  onPress={handleOpenUpdateModal}
                  showChevron
                />
              ) : (
                <SettingsRow
                  icon="refresh"
                  title="Check for Updates"
                  subtitle={`Current version ${updateInfo?.currentVersion || "1.2.2"}`}
                  onPress={handleCheckForUpdate}
                  disabled={checkingForUpdate}
                  rightComponent={
                    checkingForUpdate ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : undefined
                  }
                />
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showQualityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualityModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowQualityModal(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Video Quality
            </ThemedText>
            {VIDEO_QUALITY_OPTIONS.map((option, idx) => (
              <FocusableOption
                key={option.value}
                onPress={() => handleQualitySelect(option.value)}
                isSelected={settings.videoQuality === option.value}
                accessibilityLabel={option.label}
                hasTVPreferredFocus={isTV && idx === 0}
              >
                <ThemedText type="body">{option.label}</ThemedText>
                {settings.videoQuality === option.value ? (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                ) : null}
              </FocusableOption>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showAutoRefreshModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAutoRefreshModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAutoRefreshModal(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Auto-Refresh Playlist
            </ThemedText>
            {AUTO_REFRESH_OPTIONS.map((option, idx) => (
              <FocusableOption
                key={option.value}
                onPress={() => handleAutoRefreshSelect(option.value)}
                isSelected={settings.autoRefreshInterval === option.value}
                accessibilityLabel={option.label}
                hasTVPreferredFocus={isTV && idx === 0}
              >
                <ThemedText type="body">{option.label}</ThemedText>
                {settings.autoRefreshInterval === option.value ? (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                ) : null}
              </FocusableOption>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showThemeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowThemeModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowThemeModal(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Theme
            </ThemedText>
            <FocusableOption
              onPress={() => handleThemeSelect("dark")}
              isSelected={themeMode === "dark"}
              accessibilityLabel="Dark theme"
              hasTVPreferredFocus={isTV}
            >
              <View style={styles.themeOption}>
                <Ionicons name="moon" size={20} color={theme.text} />
                <ThemedText type="body">Dark</ThemedText>
              </View>
              {themeMode === "dark" ? (
                <Ionicons name="checkmark" size={20} color={theme.primary} />
              ) : null}
            </FocusableOption>
            <FocusableOption
              onPress={() => handleThemeSelect("light")}
              isSelected={themeMode === "light"}
              accessibilityLabel="Light theme"
            >
              <View style={styles.themeOption}>
                <Ionicons name="sunny" size={20} color={theme.text} />
                <ThemedText type="body">Light</ThemedText>
              </View>
              {themeMode === "light" ? (
                <Ionicons name="checkmark" size={20} color={theme.primary} />
              ) : null}
            </FocusableOption>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showTextSizeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTextSizeModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTextSizeModal(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Text Size
            </ThemedText>
            {TEXT_SIZE_OPTIONS.map((option, idx) => (
              <FocusableOption
                key={option.value}
                onPress={() => handleTextSizeSelect(option.value)}
                isSelected={settings.textSize === option.value}
                accessibilityLabel={option.label}
                hasTVPreferredFocus={isTV && idx === 0}
              >
                <ThemedText type="body">{option.label}</ThemedText>
                {settings.textSize === option.value ? (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                ) : null}
              </FocusableOption>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showPlaylistModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlaylistModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPlaylistModal(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Playlists
            </ThemedText>
            {playlists.length === 0 ? (
              <ThemedText
                type="body"
                style={{
                  color: theme.textSecondary,
                  textAlign: "center",
                  padding: Spacing.md,
                }}
              >
                No playlists saved
              </ThemedText>
            ) : (
              playlists.map((p, idx) => (
                <View key={p.id} style={styles.playlistGroup}>
                  {/* Playlist select row */}
                  <View style={styles.playlistRow}>
                    <FocusablePressable
                      onPress={() => handlePlaylistSelect(p.id)}
                      accessibilityLabel={`Select playlist ${p.name}`}
                      hasTVPreferredFocus={isTV && idx === 0}
                      baseStyle={[
                        styles.playlistItem,
                        {
                          backgroundColor:
                            p.id === activePlaylistId
                              ? theme.primary + "20"
                              : "transparent",
                        },
                      ]}
                      focusedStyle={styles.modalOptionFocused}
                    >
                      <View style={styles.playlistInfo}>
                        <Ionicons
                          name="list"
                          size={18}
                          color={
                            p.id === activePlaylistId
                              ? theme.primary
                              : theme.textSecondary
                          }
                        />
                        <View style={styles.playlistText}>
                          <ThemedText type="body" numberOfLines={1}>
                            {p.name}
                          </ThemedText>
                          <ThemedText
                            type="caption"
                            style={{ color: theme.textSecondary }}
                          >
                            {p.channelCount} channels
                          </ThemedText>
                        </View>
                      </View>
                      {p.id === activePlaylistId ? (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={theme.primary}
                        />
                      ) : null}
                    </FocusablePressable>
                    {/* On phone: icon buttons inline */}
                    {!isTV ? (
                      <>
                        <FocusablePressable
                          onPress={() => handleEditPlaylist(p.id)}
                          hitSlop={8}
                          accessibilityLabel={`Edit playlist ${p.name}`}
                          baseStyle={styles.editButton}
                          focusedStyle={styles.editButtonFocused}
                        >
                          <Ionicons
                            name="create-outline"
                            size={18}
                            color={theme.primary}
                          />
                        </FocusablePressable>
                        <FocusablePressable
                          onPress={() => {
                            setPlaylistToDelete(p.id);
                            setShowPlaylistModal(false);
                            setShowDeletePlaylistModal(true);
                          }}
                          hitSlop={8}
                          accessibilityLabel={`Delete playlist ${p.name}`}
                          baseStyle={styles.deleteButton}
                          focusedStyle={styles.deleteButtonFocused}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={Colors.dark.error}
                          />
                        </FocusablePressable>
                      </>
                    ) : null}
                  </View>
                  {/* On TV: full-width Edit / Delete buttons below each row */}
                  {isTV ? (
                    <View style={styles.tvPlaylistActions}>
                      <FocusablePressable
                        onPress={() => handleEditPlaylist(p.id)}
                        accessibilityLabel={`Edit playlist ${p.name}`}
                        baseStyle={styles.tvActionButton}
                        focusedStyle={styles.tvActionButtonFocused}
                      >
                        <Ionicons
                          name="create-outline"
                          size={16}
                          color={theme.primary}
                        />
                        <ThemedText
                          type="small"
                          style={{
                            color: theme.primary,
                            marginLeft: Spacing.xs,
                          }}
                        >
                          Edit
                        </ThemedText>
                      </FocusablePressable>
                      <FocusablePressable
                        onPress={() => {
                          setPlaylistToDelete(p.id);
                          setShowPlaylistModal(false);
                          setShowDeletePlaylistModal(true);
                        }}
                        accessibilityLabel={`Delete playlist ${p.name}`}
                        baseStyle={styles.tvActionButton}
                        focusedStyle={styles.tvActionButtonDestructiveFocused}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={Colors.dark.error}
                        />
                        <ThemedText
                          type="small"
                          style={{
                            color: Colors.dark.error,
                            marginLeft: Spacing.xs,
                          }}
                        >
                          Delete
                        </ThemedText>
                      </FocusablePressable>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showDeletePlaylistModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeletePlaylistModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDeletePlaylistModal(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.confirmIcon}>
              <Ionicons name="warning" size={32} color={Colors.dark.error} />
            </View>
            <ThemedText type="h4" style={styles.modalTitle}>
              Delete Playlist?
            </ThemedText>
            <ThemedText
              type="body"
              style={[styles.confirmText, { color: theme.textSecondary }]}
            >
              This will remove the playlist. Favorites will be preserved.
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Button
                onPress={() => setShowDeletePlaylistModal(false)}
                style={[
                  styles.confirmButton,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
                textStyle={{ color: theme.text }}
                hasTVPreferredFocus={isTV}
              >
                Cancel
              </Button>
              <Button
                onPress={handleDeletePlaylist}
                style={[
                  styles.confirmButton,
                  { backgroundColor: Colors.dark.error },
                ]}
              >
                Delete
              </Button>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showClearAllConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearAllConfirm(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowClearAllConfirm(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.confirmIcon}>
              <Ionicons name="warning" size={32} color={Colors.dark.error} />
            </View>
            <ThemedText type="h4" style={styles.modalTitle}>
              Clear All Data?
            </ThemedText>
            <ThemedText
              type="body"
              style={[styles.confirmText, { color: theme.textSecondary }]}
            >
              This will remove all app data including playlists, favorites, and
              settings.
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Button
                onPress={() => setShowClearAllConfirm(false)}
                style={[
                  styles.confirmButton,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
                textStyle={{ color: theme.text }}
                hasTVPreferredFocus={isTV}
              >
                Cancel
              </Button>
              <Button
                onPress={handleClearAllData}
                style={[
                  styles.confirmButton,
                  { backgroundColor: Colors.dark.error },
                ]}
              >
                Clear All
              </Button>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showEditPlaylistModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditPlaylistModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowEditPlaylistModal(false)}
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Edit Playlist
            </ThemedText>
            <View style={styles.editInputContainer}>
              <ThemedText
                type="small"
                style={[styles.editInputLabel, { color: theme.textSecondary }]}
              >
                Playlist Name
              </ThemedText>
              <TextInput
                value={editPlaylistName}
                onChangeText={setEditPlaylistName}
                placeholder="My Playlist"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.editInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: theme.backgroundSecondary,
                  },
                ]}
                showSoftInputOnFocus={true}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <View style={styles.editInputContainer}>
              <ThemedText
                type="small"
                style={[styles.editInputLabel, { color: theme.textSecondary }]}
              >
                Playlist URL (optional)
              </ThemedText>
              <TextInput
                value={editPlaylistUrl}
                onChangeText={setEditPlaylistUrl}
                placeholder="https://example.com/playlist.m3u"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.editInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: theme.backgroundSecondary,
                  },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                showSoftInputOnFocus={true}
              />
            </View>
            <View style={styles.confirmButtons}>
              <Button
                onPress={() => setShowEditPlaylistModal(false)}
                style={[
                  styles.confirmButton,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
                textStyle={{ color: theme.text }}
                disabled={isLoadingPlaylist}
                hasTVPreferredFocus={isTV}
              >
                Cancel
              </Button>
              <Button
                onPress={handleSaveEditPlaylist}
                style={styles.confirmButton}
                disabled={!editPlaylistName.trim() || isLoadingPlaylist}
              >
                {isLoadingPlaylist ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  "Save"
                )}
              </Button>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showUpdateModal}
        transparent
        animationType="fade"
        onRequestClose={() =>
          !downloadingApk && !installingApk && setShowUpdateModal(false)
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() =>
            !downloadingApk && !installingApk && setShowUpdateModal(false)
          }
          focusable={!isTV}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.confirmIcon}>
              <Ionicons name="cloud-download" size={32} color={theme.primary} />
            </View>
            <ThemedText type="h4" style={styles.modalTitle}>
              Update to v{updateInfo?.latestVersion}
            </ThemedText>
            {updateInfo?.releaseNotes && (
              <ScrollView
                style={[
                  styles.releaseNotesContainer,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
                contentContainerStyle={styles.releaseNotesContent}
              >
                <ThemedText
                  type="small"
                  style={[styles.releaseNotesText, { color: theme.text }]}
                >
                  {updateInfo.releaseNotes}
                </ThemedText>
              </ScrollView>
            )}
            {updateError && (
              <ThemedText
                type="small"
                style={[styles.errorText, { color: Colors.dark.error }]}
              >
                {updateError}
              </ThemedText>
            )}
            {downloadingApk && (
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { backgroundColor: theme.backgroundSecondary },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${downloadProgress}%`,
                        backgroundColor: theme.primary,
                      },
                    ]}
                  />
                </View>
                <ThemedText
                  type="small"
                  style={[styles.progressText, { color: theme.textSecondary }]}
                >
                  Downloading... {downloadProgress}%
                </ThemedText>
              </View>
            )}
            {installingApk && (
              <View style={styles.progressContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <ThemedText
                  type="small"
                  style={[styles.progressText, { color: theme.textSecondary }]}
                >
                  Installing update...
                </ThemedText>
              </View>
            )}
            <View style={styles.confirmButtons}>
              <Button
                onPress={() => setShowUpdateModal(false)}
                style={[
                  styles.confirmButton,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
                textStyle={{ color: theme.text }}
                disabled={downloadingApk || installingApk}
                hasTVPreferredFocus={isTV}
              >
                Later
              </Button>
              <Button
                onPress={handleDownloadAndInstall}
                style={styles.confirmButton}
                disabled={downloadingApk || installingApk}
              >
                {downloadingApk ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : installingApk ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  "Install"
                )}
              </Button>
            </View>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {},
  columns: {
    flexDirection: "row",
    gap: Spacing["2xl"],
    flexWrap: "wrap",
  },
  columnsSingle: {
    flexDirection: "column",
    gap: 0,
    width: "100%",
  },
  column: {
    width: "100%",
  },
  columnWide: {
    flex: 1,
    maxWidth: 450,
    width: "auto",
  },
  twoColumnLayout: {
    flexDirection: "row",
    gap: Spacing["2xl"],
    alignItems: "flex-start",
  },
  singleColumnLayout: {
    flexDirection: "column",
  },
  twoColumnItem: {
    flex: 1,
  },
  fullWidth: {
    width: "100%",
  },
  sectionTitle: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
    fontWeight: "600",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  section: {},
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  modalOptionFocused: {
    backgroundColor: Colors.dark.primary + "30",
    transform: [{ scale: 1.03 }],
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playlistGroup: {
    marginBottom: Spacing.xs,
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tvPlaylistActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  tvActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tvActionButtonFocused: {
    backgroundColor: Colors.dark.primary + "20",
    transform: [{ scale: 1.03 }],
  },
  tvActionButtonDestructiveFocused: {
    backgroundColor: Colors.dark.error + "20",
    transform: [{ scale: 1.03 }],
  },
  playlistItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  playlistInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  playlistText: {
    flex: 1,
  },
  deleteButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  deleteButtonFocused: {
    backgroundColor: Colors.dark.error + "20",
  },
  editButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  editButtonFocused: {
    backgroundColor: Colors.dark.primary + "20",
  },
  editInputContainer: {
    marginBottom: Spacing.md,
  },
  editInputLabel: {
    marginBottom: Spacing.xs,
    fontSize: 12,
    fontWeight: "600",
  },
  editInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 14,
  },
  confirmIcon: {
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  confirmText: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  confirmButton: {
    flex: 1,
  },
  releaseNotesContainer: {
    maxHeight: 150,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  releaseNotesContent: {
    paddingVertical: Spacing.xs,
  },
  releaseNotesText: {
    lineHeight: 18,
  },
  errorText: {
    textAlign: "center",
    marginBottom: Spacing.md,
    fontSize: 13,
  },
  progressContainer: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  progressBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
  },
});
