import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
  Platform,
  ViewStyle,
} from "react-native";

const isTV = Platform.isTV;
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { SearchBar } from "@/components/SearchBar";
import { ChannelCardHorizontal } from "@/components/ChannelCardHorizontal";
import { EmptyState } from "@/components/EmptyState";
import { usePlaylist } from "@/context/PlaylistContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useOrientation } from "@/hooks/useOrientation";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Channel } from "@/types/playlist";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const emptyChannelsImage = require("../../assets/images/empty-channels.png");

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function FocusableCategoryItem({ cat, isSelected, isFav, count, onPress, onFavoritePress, theme }: {
  cat: string;
  isSelected: boolean;
  isFav: boolean;
  count: number;
  onPress: () => void;
  onFavoritePress: (cat: string, e: any) => void;
  theme: any;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [isFavFocused, setIsFavFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      style={[
        styles.categoryItem,
        {
          backgroundColor: isSelected
            ? Colors.dark.primary + "20"
            : "transparent",
        },
        isFocused && {
          borderWidth: 2,
          borderColor: Colors.dark.primary,
          backgroundColor: Colors.dark.primary + "30",
          transform: [{ scale: 1.02 }],
        },
      ] as ViewStyle[]}
      testID={`category-${cat}`}
    >
      <View style={styles.categoryItemLeft}>
        {isFav ? (
          <Ionicons
            name="star"
            size={16}
            color={Colors.dark.primary}
            style={styles.categoryStarIcon}
          />
        ) : null}
        <ThemedText
          type="body"
          numberOfLines={1}
          style={[
            styles.categoryItemText,
            isSelected && { color: Colors.dark.primary, fontWeight: "600" },
            isFocused && { color: "#FFFFFF" },
          ]}
        >
          {cat}
        </ThemedText>
      </View>
      <View style={styles.categoryItemRight}>
        <ThemedText
          type="small"
          style={{ color: isFocused ? Colors.dark.primary : theme.textSecondary }}
        >
          {count}
        </ThemedText>
        {cat !== "All" ? (
          <Pressable
            onPress={(e) => onFavoritePress(cat, e)}
            onFocus={() => setIsFavFocused(true)}
            onBlur={() => setIsFavFocused(false)}
            style={[
              styles.categoryFavButton,
              isFavFocused && styles.categoryFavButtonFocused,
            ] as ViewStyle[]}
            hitSlop={8}
            focusable={true}
            accessibilityLabel={isFav ? `Remove ${cat} from favorites` : `Add ${cat} to favorites`}
            accessibilityRole="button"
          >
            <Ionicons
              name={isFav ? "star" : "star-outline"}
              size={18}
              color={isFav ? Colors.dark.primary : theme.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function FocusableMenuButton({ onPress, theme }: { onPress: () => void; theme: any }) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      style={[
        styles.menuButton,
        { backgroundColor: theme.backgroundSecondary },
        isFocused && { borderWidth: 2, borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "30" },
      ] as ViewStyle[]}
      testID="menu-button"
    >
      <Ionicons name="menu" size={22} color={isFocused ? "#FFFFFF" : theme.text} />
    </Pressable>
  );
}

function FocusableCloseButton({ onPress, theme }: { onPress: () => void; theme: any }) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      accessibilityLabel="Close categories"
      accessibilityRole="button"
      style={[
        styles.closeButton,
        isFocused && styles.closeButtonFocused,
      ] as ViewStyle[]}
    >
      <Ionicons name="close" size={24} color={isFocused ? "#FFFFFF" : theme.text} />
    </Pressable>
  );
}

const DRAWER_WIDTH = 280;
const DOUBLE_PRESS_DELAY = 300;

const ItemSeparator = () => <View style={{ height: Spacing.sm }} />;
const keyExtractor = (item: Channel) => item.id;

export default function ChannelsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { isUltraWide, gridColumns, cardWidth } = useResponsive();
  const { isPortrait } = useOrientation();
  const { theme } = useThemeContext();

  const {
    playlist,
    favorites,
    favoriteCategories,
    isLoading,
    toggleFavorite,
    toggleFavoriteCategory,
    isCategoryFavorite,
    searchChannels,
    settings,
    updateSettings,
  } = usePlaylist();

  const initialCategory = settings.rememberLastCategory ? settings.lastCategory : "All";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drawerTranslate = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const lastLeftPressTime = useRef<number>(0);

  const categories = useMemo(() => {
    if (!playlist) return ["All"];
    const sortedCategories = [...playlist.categories].sort((a, b) => {
      const aIsFav = favoriteCategories.includes(a);
      const bIsFav = favoriteCategories.includes(b);
      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;
      return 0;
    });
    return ["All", ...sortedCategories];
  }, [playlist, favoriteCategories]);

  const categoryChannelCounts = useMemo(() => {
    if (!playlist) return {};
    const counts: Record<string, number> = {
      All: playlist.channels.length,
    };
    for (const ch of playlist.channels) {
      if (ch.group) {
        counts[ch.group] = (counts[ch.group] || 0) + 1;
      }
    }
    return counts;
  }, [playlist]);

  const filteredChannels = useMemo(() => {
    if (!playlist) return [];

    if (searchQuery.trim()) {
      return searchChannels(searchQuery);
    }

    if (selectedCategory !== "All") {
      return playlist.channels.filter((ch) => ch.group === selectedCategory);
    }

    return playlist.channels;
  }, [playlist, searchQuery, selectedCategory, searchChannels]);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    drawerTranslate.value = withTiming(0, { duration: 250 });
    backdropOpacity.value = withTiming(0.5, { duration: 250 });
    if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const closeDrawer = useCallback(() => {
    drawerTranslate.value = withTiming(-DRAWER_WIDTH, { duration: 200 });
    backdropOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => setDrawerOpen(false), 200);
  }, []);

  const handleLeftPress = useCallback(() => {
    const now = Date.now();
    if (now - lastLeftPressTime.current < DOUBLE_PRESS_DELAY) {
      openDrawer();
      lastLeftPressTime.current = 0;
    } else {
      lastLeftPressTime.current = now;
    }
  }, [openDrawer]);

  useEffect(() => {
    if (!isTV) return;

    let tvEventHandler: any = null;
    
    try {
      const RN = require("react-native");
      const TVHandler = RN.TVEventHandler;
      if (TVHandler) {
        tvEventHandler = new TVHandler();
        tvEventHandler.enable(null, (cmp: any, evt: any) => {
          if (evt && evt.eventType === "left") {
            handleLeftPress();
          }
        });
      }
    } catch (e) {
      // TV handler not available
    }

    return () => {
      if (tvEventHandler) {
        try {
          tvEventHandler.disable();
        } catch (e) {}
      }
    };
  }, [handleLeftPress]);

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
    setSearchQuery("");
    closeDrawer();
    if (settings.rememberLastCategory) {
      updateSettings({ lastCategory: category });
    }
  }, [closeDrawer, settings.rememberLastCategory, updateSettings]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleCategoryFavoritePress = useCallback(
    async (category: string, e: any) => {
      e.stopPropagation();
      await toggleFavoriteCategory(category);
      if (!isTV) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [toggleFavoriteCategory]
  );

  const animatedDrawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerTranslate.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

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

  const renderChannel = useCallback(
    ({ item: channel }: { item: Channel }) => (
      <ChannelCardHorizontal
        channel={channel}
        isFavorite={favoritesSet.has(channel.id)}
        onPress={getChannelPressHandler(channel.id)}
        onFavoritePress={getFavoritePressHandler(channel.id)}
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
    const currentCategory = selectedCategory !== "All" ? selectedCategory : 
      (searchQuery.trim() ? "Search Results" : "All Channels");
    const isCatFavorite = selectedCategory !== "All" && isCategoryFavorite(selectedCategory);
    
    return (
      <View style={styles.listHeader}>
        <View style={styles.categoryHeader}>
          <View style={styles.categoryTitleRow}>
            {isCatFavorite ? (
              <View style={styles.favoriteCategoryIcon}>
                <ThemedText type="caption" style={{ color: Colors.dark.primary }}>
                  ★
                </ThemedText>
              </View>
            ) : null}
            <ThemedText type="h4" style={[styles.categoryTitle, isUltraWide && styles.categoryTitleCompact]}>
              {currentCategory}
            </ThemedText>
          </View>
          <ThemedText
            type="small"
            style={[styles.categoryCount, { color: theme.textSecondary }]}
          >
            {filteredChannels.length} channels
          </ThemedText>
        </View>
      </View>
    );
  }, [selectedCategory, searchQuery, isCategoryFavorite, isUltraWide, filteredChannels.length, theme]);

  const ListEmpty = useMemo(() => (
    <View style={styles.emptyContainer}>
      <EmptyState
        image={emptyChannelsImage}
        title="No Results"
        description={searchQuery ? `No channels found for "${searchQuery}"` : "No channels in this category"}
        actionLabel={searchQuery ? "Clear Search" : undefined}
        onAction={searchQuery ? () => handleSearchChange("") : undefined}
      />
    </View>
  ), [searchQuery, handleSearchChange]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      </ThemedView>
    );
  }

  if (!playlist || playlist.channels.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyContainer}>
          <EmptyState
            image={emptyChannelsImage}
            title="No Playlist Loaded"
            description="Go to Settings to add your M3U playlist"
          />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: isPortrait ? insets.top + Spacing.sm : Spacing.sm,
            paddingLeft: insets.left + Spacing.md,
            paddingRight: insets.right + Spacing.md,
            borderBottomColor: theme.backgroundSecondary,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <FocusableMenuButton onPress={openDrawer} theme={theme} />
          <View style={[styles.searchContainer, isUltraWide && styles.searchContainerCompact]}>
            <SearchBar
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search channels..."
            />
          </View>
        </View>
        <View style={styles.selectedCategoryRow}>
          <ThemedText type="body" numberOfLines={1} style={[styles.selectedCategoryText, { fontWeight: "600" }]}>
            {selectedCategory}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {categoryChannelCounts[selectedCategory] || 0} channels
          </ThemedText>
        </View>
      </View>

      <View style={styles.listContainer}>
        <FlashList<Channel>
          key={`grid-${gridColumns}`}
          data={filteredChannels}
          renderItem={renderChannel}
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

      <Modal
        visible={drawerOpen}
        transparent
        animationType="none"
        onRequestClose={closeDrawer}
        statusBarTranslucent
      >
        <View style={styles.drawerOverlay}>
          <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
          </Animated.View>
          
          <Animated.View
            style={[
              styles.drawer,
              {
                backgroundColor: theme.backgroundDefault,
                paddingTop: insets.top + Spacing.md,
                paddingBottom: insets.bottom + Spacing.md,
              },
              animatedDrawerStyle,
            ]}
          >
            <View style={styles.drawerHeader}>
              <ThemedText type="h4">Categories</ThemedText>
              <FocusableCloseButton onPress={closeDrawer} theme={theme} />
            </View>
            
            <FlashList
              data={categories}
              renderItem={({ item: cat }) => {
                const isSelected = selectedCategory === cat;
                const isFav = isCategoryFavorite(cat);
                const count = categoryChannelCounts[cat] || 0;
                
                return (
                  <FocusableCategoryItem
                    cat={cat}
                    isSelected={isSelected}
                    isFav={isFav}
                    count={count}
                    onPress={() => handleCategoryChange(cat)}
                    onFavoritePress={handleCategoryFavoritePress}
                    theme={theme}
                  />
                );
              }}
              keyExtractor={(item) => item}
              estimatedItemSize={56}
              contentContainerStyle={{
                paddingTop: Spacing.sm,
              }}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        </View>
      </Modal>
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
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    flex: 1,
    maxWidth: 350,
  },
  searchContainerCompact: {
    maxWidth: 300,
  },
  selectedCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  selectedCategoryText: {
    flex: 1,
    marginRight: Spacing.md,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  listHeaderWrapper: {
    zIndex: 1,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  categoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  favoriteCategoryIcon: {
    marginRight: 4,
  },
  categoryTitle: {},
  categoryTitleCompact: {
    fontSize: 16,
  },
  categoryCount: {
    fontSize: 12,
  },
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
  drawerOverlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  closeButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  closeButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },

  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  categoryItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryStarIcon: {
    marginRight: Spacing.xs,
  },
  categoryItemText: {
    flex: 1,
  },
  categoryItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  categoryFavButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "transparent",
  },
  categoryFavButtonFocused: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
});
