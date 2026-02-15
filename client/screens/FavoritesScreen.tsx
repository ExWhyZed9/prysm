import React, { useState, useMemo, useCallback, useRef } from "react";
import { StyleSheet, View, ActivityIndicator, Pressable, Platform, ViewStyle } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { SearchBar } from "@/components/SearchBar";
import { ChannelCardHorizontal } from "@/components/ChannelCardHorizontal";
import { EmptyState } from "@/components/EmptyState";
import { usePlaylist } from "@/context/PlaylistContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Channel } from "@/types/playlist";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const emptyFavoritesImage = require("../../assets/images/empty-favorites.png");

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ViewMode = "channels" | "categories";

function FocusableTab({ onPress, isActive, icon, label, accessibilityLabel }: {
  onPress: () => void;
  isActive: boolean;
  icon: string;
  label: string;
  accessibilityLabel: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={[
        styles.tab,
        isActive && styles.tabActive,
        isFocused && styles.tabFocused,
      ] as ViewStyle[]}
    >
      <Ionicons
        name={icon as any}
        size={16}
        color={isFocused ? "#FFFFFF" : isActive ? Colors.dark.primary : Colors.dark.textSecondary}
      />
      <ThemedText
        type="small"
        style={[
          styles.tabText,
          { color: isFocused ? "#FFFFFF" : isActive ? Colors.dark.primary : Colors.dark.textSecondary },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const ItemSeparator = () => <View style={{ height: Spacing.sm }} />;
const keyExtractor = (item: Channel) => item.id;

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { isUltraWide, gridColumns, cardWidth } = useResponsive();

  const {
    playlist,
    favorites,
    favoriteCategories,
    isLoading,
    toggleFavorite,
    toggleFavoriteCategory,
    getFavoriteChannels,
    getFavoriteCategoryChannels,
    settings,
  } = usePlaylist();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("channels");

  const { theme } = require("@/context/ThemeContext").useThemeContext();

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  const favoriteChannels = useMemo(() => {
    return getFavoriteChannels();
  }, [getFavoriteChannels]);

  const filteredChannels = useMemo(() => {
    const channels = viewMode === "channels" ? favoriteChannels : getFavoriteCategoryChannels();
    if (!searchQuery.trim()) return channels;

    const lowerQuery = searchQuery.toLowerCase();
    return channels.filter(
      (ch) =>
        ch.name.toLowerCase().includes(lowerQuery) ||
        ch.group.toLowerCase().includes(lowerQuery)
    );
  }, [favoriteChannels, getFavoriteCategoryChannels, searchQuery, viewMode]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const channelPressHandlers = useRef(new Map<string, () => void>()).current;
  const favoritePressHandlers = useRef(new Map<string, () => void>()).current;

  const getChannelPressHandler = useCallback(
    (channelId: string) => {
      let handler = channelPressHandlers.get(channelId);
      if (!handler) {
        handler = () => navigation.navigate("Player", { channelId });
        channelPressHandlers.set(channelId, handler);
      }
      return handler;
    },
    [navigation, channelPressHandlers]
  );

  const getFavoritePressHandler = useCallback(
    (channelId: string) => {
      let handler = favoritePressHandlers.get(channelId);
      if (!handler) {
        handler = () => toggleFavorite(channelId);
        favoritePressHandlers.set(channelId, handler);
      }
      return handler;
    },
    [toggleFavorite, favoritePressHandlers]
  );

  const handleCategoryUnfavorite = useCallback(
    async (category: string) => {
      if (!Platform.isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await toggleFavoriteCategory(category);
    },
    [toggleFavoriteCategory]
  );

  const renderChannelItem = useCallback(
    ({ item }: { item: Channel }) => (
      <ChannelCardHorizontal
        channel={item}
        isFavorite={favoritesSet.has(item.id)}
        onPress={getChannelPressHandler(item.id)}
        onFavoritePress={getFavoritePressHandler(item.id)}
        cardWidth={cardWidth}
        isUltraWide={isUltraWide}
        textSize={settings.textSize}
        themeBackground={theme.backgroundDefault}
        themeTextSecondary={theme.textSecondary}
      />
    ),
    [favoritesSet, getChannelPressHandler, getFavoritePressHandler, cardWidth, isUltraWide, settings.textSize, theme.backgroundDefault, theme.textSecondary]
  );

  const ListHeader = useMemo(() => {
    const title = viewMode === "channels" ? "Favorite Channels" : "Favorite Categories";
    return (
      <View style={styles.listHeader}>
        <ThemedText type="h4" style={styles.sectionTitle}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: Colors.dark.textSecondary }}>
          {filteredChannels.length} channels
        </ThemedText>
      </View>
    );
  }, [viewMode, filteredChannels.length]);

  const ListEmpty = useMemo(() => {
    if (!playlist) {
      return (
        <View style={styles.emptyContainer}>
          <EmptyState
            image={emptyFavoritesImage}
            title="No Playlist"
            description="Add a playlist first to start saving favorites"
          />
        </View>
      );
    }
    if (searchQuery) {
      return (
        <View style={styles.emptyContainer}>
          <EmptyState
            image={emptyFavoritesImage}
            title="No Results"
            description={`No favorites found for "${searchQuery}"`}
            actionLabel="Clear Search"
            onAction={() => handleSearchChange("")}
          />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          image={emptyFavoritesImage}
          title={viewMode === "channels" ? "No Favorite Channels" : "No Favorite Categories"}
          description={
            viewMode === "channels"
              ? "Tap the star icon on any channel to add it to your favorites"
              : "Tap the star on a category chip to add categories to your favorites"
          }
        />
      </View>
    );
  }, [playlist, searchQuery, viewMode, handleSearchChange]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      </ThemedView>
    );
  }

  const hasChannelFavorites = favoriteChannels.length > 0;
  const hasCategoryFavorites = favoriteCategories.length > 0;
  const hasAnyFavorites = hasChannelFavorites || hasCategoryFavorites;

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.sm,
            paddingLeft: insets.left + Spacing.md,
            paddingRight: insets.right + Spacing.md,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={[styles.searchContainer, isUltraWide && styles.searchContainerCompact]}>
            <SearchBar
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search favorites..."
            />
          </View>
        </View>
        {hasAnyFavorites ? (
          <View style={styles.tabsContainer}>
            <FocusableTab
              onPress={() => handleViewModeChange("channels")}
              isActive={viewMode === "channels"}
              icon="star"
              label={`Channels (${favoriteChannels.length})`}
              accessibilityLabel="Channels view"
            />
            <FocusableTab
              onPress={() => handleViewModeChange("categories")}
              isActive={viewMode === "categories"}
              icon="folder"
              label={`Categories (${favoriteCategories.length})`}
              accessibilityLabel="Categories view"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.listContainer}>
        <FlashList<Channel>
          key={`grid-${gridColumns}`}
          data={filteredChannels}
          renderItem={renderChannelItem}
          keyExtractor={keyExtractor}
          numColumns={gridColumns}
          ListHeaderComponent={ListHeader}
          ListHeaderComponentStyle={styles.listHeaderWrapper}
          ListEmptyComponent={ListEmpty}
          drawDistance={300}
          contentContainerStyle={{
            paddingBottom: insets.bottom + Spacing.md,
            paddingHorizontal: Spacing.xs,
          }}
          ItemSeparatorComponent={ItemSeparator}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchContainer: {
    flex: 1,
    maxWidth: 350,
  },
  searchContainerCompact: {
    maxWidth: 300,
  },
  tabsContainer: {
    flexDirection: "row",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  tabFocused: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "30",
    transform: [{ scale: 1.08 }],
  },
  tabText: {
    fontWeight: "600",
    fontSize: 12,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  listHeaderWrapper: {
    zIndex: 1,
  },
  sectionTitle: {},
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
});
