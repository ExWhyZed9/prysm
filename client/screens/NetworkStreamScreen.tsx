import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  Modal,
  Platform,
  ViewStyle,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import {
  NetworkStreamConfig,
  DrmScheme,
  UserAgent,
  DEFAULT_NETWORK_STREAM,
  USER_AGENT_STRINGS,
  getNetworkStreamConfig,
  saveNetworkStreamConfig,
} from "@/lib/storage";

const isTV = Platform.isTV;

// ─── focusable helper ────────────────────────────────────────────────────────

function FocusablePressable({
  onPress,
  style,
  focusedStyle,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  style: ViewStyle | ViewStyle[];
  focusedStyle?: ViewStyle;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={
        [
          ...(Array.isArray(style) ? style : [style]),
          isFocused && (focusedStyle ?? styles.focusedBorder),
        ] as ViewStyle[]
      }
    >
      {children}
    </Pressable>
  );
}

// ─── option lists ─────────────────────────────────────────────────────────────

const USER_AGENT_OPTIONS: { label: string; value: UserAgent }[] = [
  { label: "Chrome (Desktop)", value: "chrome" },
  { label: "Firefox (Desktop)", value: "firefox" },
  { label: "Safari (macOS)", value: "safari" },
  { label: "iPhone / iOS Safari", value: "iphone" },
  { label: "Android Chrome", value: "android" },
  { label: "Smart TV (Tizen)", value: "smarttv" },
  { label: "Custom", value: "custom" },
];

const DRM_SCHEME_OPTIONS: { label: string; value: DrmScheme; desc: string }[] =
  [
    { label: "Widevine", value: "widevine", desc: "Android / Chrome" },
    { label: "PlayReady", value: "playready", desc: "Windows / Xbox" },
    { label: "ClearKey", value: "clearkey", desc: "Open standard" },
  ];

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <ThemedText
      type="small"
      style={[styles.sectionLabel, { color: theme.textSecondary }]}
    >
      {children}
    </ThemedText>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  multiline = false,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "url" | "email-address";
  autoCapitalize?: "none" | "sentences";
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.fieldContainer}>
      <ThemedText
        type="small"
        style={[styles.fieldLabel, { color: theme.textSecondary }]}
      >
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            color: theme.text,
            backgroundColor: theme.backgroundSecondary,
            borderColor: theme.backgroundSecondary,
          },
        ]}
      />
    </View>
  );
}

function PickerRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  return (
    <View style={styles.fieldContainer}>
      <ThemedText
        type="small"
        style={[styles.fieldLabel, { color: theme.textSecondary }]}
      >
        {label}
      </ThemedText>
      <Pressable
        onPress={onPress}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        focusable={true}
        style={[
          styles.pickerRow,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: isFocused ? Colors.dark.primary : "transparent",
          },
        ]}
      >
        <ThemedText type="body" style={{ flex: 1 }}>
          {value}
        </ThemedText>
        <Ionicons
          name="chevron-down"
          size={16}
          color={isFocused ? Colors.dark.primary : theme.textSecondary}
        />
      </Pressable>
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function NetworkStreamScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { theme } = useTheme();

  const [config, setConfig] = useState<NetworkStreamConfig>(
    DEFAULT_NETWORK_STREAM,
  );
  const [showUserAgentModal, setShowUserAgentModal] = useState(false);
  const [showDrmSchemeModal, setShowDrmSchemeModal] = useState(false);

  // Load persisted config on mount
  useEffect(() => {
    getNetworkStreamConfig().then(setConfig);
  }, []);

  const update = useCallback(
    (patch: Partial<NetworkStreamConfig>) =>
      setConfig((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handlePlay = useCallback(async () => {
    // Persist the config so it survives restarts, then launch the player
    await saveNetworkStreamConfig(config);
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("NetworkPlayer", { config });
  }, [config, navigation]);

  const handleClear = useCallback(() => {
    setConfig(DEFAULT_NETWORK_STREAM);
  }, []);

  const getUserAgentLabel = () =>
    USER_AGENT_OPTIONS.find((o) => o.value === config.userAgent)?.label ??
    "Chrome (Desktop)";

  const getDrmSchemeLabel = () =>
    DRM_SCHEME_OPTIONS.find((o) => o.value === config.drmScheme)?.label ??
    "Widevine";

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.sm,
            paddingLeft: insets.left + Spacing.md,
            paddingRight: insets.right + Spacing.md,
            borderBottomColor: theme.backgroundSecondary,
          },
        ]}
      >
        <FocusablePressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </FocusablePressable>
        <ThemedText type="h4" style={styles.headerTitle}>
          Network Stream
        </ThemedText>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + Spacing["2xl"],
            paddingLeft: insets.left + Spacing.md,
            paddingRight: insets.right + Spacing.md,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        {/* Stream */}
        <SectionLabel>STREAM</SectionLabel>
        <View style={styles.section}>
          <Field
            label="Media Stream URL"
            value={config.url}
            onChangeText={(v) => update({ url: v })}
            placeholder="https://example.com/stream.m3u8"
            keyboardType="url"
          />
        </View>

        {/* HTTP Headers */}
        <SectionLabel>HTTP HEADERS</SectionLabel>
        <View style={styles.section}>
          <Field
            label="Cookie"
            value={config.cookie}
            onChangeText={(v) => update({ cookie: v })}
            placeholder="sessionid=abc123; token=xyz"
          />
          <Field
            label="Referer"
            value={config.referer}
            onChangeText={(v) => update({ referer: v })}
            placeholder="https://example.com/"
            keyboardType="url"
          />
          <Field
            label="Origin"
            value={config.origin}
            onChangeText={(v) => update({ origin: v })}
            placeholder="https://example.com"
            keyboardType="url"
          />
        </View>

        {/* User Agent */}
        <SectionLabel>USER AGENT</SectionLabel>
        <View style={styles.section}>
          <PickerRow
            label="User Agent Preset"
            value={getUserAgentLabel()}
            onPress={() => setShowUserAgentModal(true)}
          />
          {config.userAgent === "custom" ? (
            <Field
              label="Custom User Agent String"
              value={config.customUserAgent}
              onChangeText={(v) => update({ customUserAgent: v })}
              placeholder="Mozilla/5.0 ..."
              multiline
            />
          ) : (
            <View style={styles.uaPreview}>
              <ThemedText
                type="caption"
                style={[styles.uaPreviewText, { color: theme.textSecondary }]}
                numberOfLines={2}
              >
                {USER_AGENT_STRINGS[config.userAgent]}
              </ThemedText>
            </View>
          )}
        </View>

        {/* DRM */}
        <SectionLabel>DRM</SectionLabel>
        <View style={styles.section}>
          <PickerRow
            label="DRM Scheme"
            value={getDrmSchemeLabel()}
            onPress={() => setShowDrmSchemeModal(true)}
          />
          <Field
            label="DRM License URL or Key"
            value={config.drmLicenseUrl}
            onChangeText={(v) => update({ drmLicenseUrl: v })}
            placeholder="https://license.example.com/widevine"
            keyboardType="url"
          />
          <View
            style={[
              styles.drmHint,
              { backgroundColor: Colors.dark.primary + "10" },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={Colors.dark.primary}
              style={{ marginTop: 1 }}
            />
            <ThemedText
              type="caption"
              style={[styles.drmHintText, { color: theme.textSecondary }]}
            >
              For ClearKey, enter the key directly as{" "}
              <ThemedText type="caption" style={{ color: Colors.dark.primary }}>
                keyId:key
              </ThemedText>{" "}
              (hex or base64). For Widevine/PlayReady, enter the license server
              URL.
            </ThemedText>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Button
            onPress={handleClear}
            style={[
              styles.actionButton,
              { backgroundColor: theme.backgroundSecondary },
            ]}
            textStyle={{ color: theme.text }}
          >
            Clear
          </Button>
          <Button
            onPress={handlePlay}
            style={styles.actionButton}
            disabled={!config.url.trim()}
          >
            Play
          </Button>
        </View>
      </KeyboardAwareScrollView>

      {/* User Agent picker modal */}
      <Modal
        visible={showUserAgentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUserAgentModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowUserAgentModal(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              User Agent
            </ThemedText>
            {USER_AGENT_OPTIONS.map((opt) => (
              <FocusablePressable
                key={opt.value}
                onPress={() => {
                  update({ userAgent: opt.value });
                  if (!isTV)
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowUserAgentModal(false);
                }}
                style={
                  [
                    styles.modalOption,
                    config.userAgent === opt.value
                      ? { backgroundColor: Colors.dark.primary + "20" }
                      : {},
                  ] as ViewStyle[]
                }
                focusedStyle={styles.modalOptionFocused}
                accessibilityLabel={opt.label}
              >
                <ThemedText type="body">{opt.label}</ThemedText>
                {config.userAgent === opt.value ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={Colors.dark.primary}
                  />
                ) : null}
              </FocusablePressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* DRM Scheme picker modal */}
      <Modal
        visible={showDrmSchemeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDrmSchemeModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDrmSchemeModal(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              DRM Scheme
            </ThemedText>
            {DRM_SCHEME_OPTIONS.map((opt) => (
              <FocusablePressable
                key={opt.value}
                onPress={() => {
                  update({ drmScheme: opt.value });
                  if (!isTV)
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDrmSchemeModal(false);
                }}
                style={
                  [
                    styles.modalOption,
                    config.drmScheme === opt.value
                      ? { backgroundColor: Colors.dark.primary + "20" }
                      : {},
                  ] as ViewStyle[]
                }
                focusedStyle={styles.modalOptionFocused}
                accessibilityLabel={opt.label}
              >
                <View style={styles.drmOptionText}>
                  <ThemedText type="body">{opt.label}</ThemedText>
                  <ThemedText
                    type="caption"
                    style={{ color: theme.textSecondary }}
                  >
                    {opt.desc}
                  </ThemedText>
                </View>
                {config.drmScheme === opt.value ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={Colors.dark.primary}
                  />
                ) : null}
              </FocusablePressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  headerTitle: { flex: 1, textAlign: "center" },
  headerRight: { width: 38 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },

  // Content
  content: { paddingTop: Spacing.md },
  sectionLabel: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    fontWeight: "600",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  section: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },

  // Field
  fieldContainer: { marginBottom: Spacing.sm },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  input: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },

  // Picker row
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
  },

  // UA preview
  uaPreview: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  uaPreviewText: {
    fontSize: 11,
    fontStyle: "italic",
  },

  // DRM hint
  drmHint: {
    flexDirection: "row",
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },
  drmHintText: { flex: 1, fontSize: 11, lineHeight: 16 },

  // Actions
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing["2xl"],
  },
  actionButton: { flex: 1 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  modalContent: {
    width: "100%",
    maxWidth: 380,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  modalTitle: { textAlign: "center", marginBottom: Spacing.md },
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
    transform: [{ scale: 1.02 }],
  },
  drmOptionText: { gap: 2 },

  // Generic focus border for FocusablePressable default
  focusedBorder: {
    backgroundColor: Colors.dark.primary + "20",
  },
});
