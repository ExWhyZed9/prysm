import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from "react";
import { AppState, AppStateStatus } from "react-native";
import { Channel, Playlist } from "@/types/playlist";
import * as storage from "@/lib/storage";
import { parseM3U, fetchAndParseM3U } from "@/lib/m3u-parser";

interface PlaylistContextType {
  playlist: Playlist | null;
  playlists: storage.PlaylistInfo[];
  activePlaylistId: string | null;
  favorites: string[];
  favoriteCategories: string[];
  recentChannels: string[];
  settings: storage.AppSettings;
  isLoading: boolean;
  isLoadingPlaylist: boolean;
  cancelLoading: () => void;
  error: string | null;
  loadPlaylistFromUrl: (url: string) => Promise<void>;
  loadPlaylistFromFile: (content: string, name: string) => Promise<void>;
  switchPlaylist: (playlistId: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  toggleFavorite: (channelId: string) => Promise<void>;
  toggleFavoriteCategory: (category: string) => Promise<void>;
  addToRecent: (channelId: string) => Promise<void>;
  updateSettings: (settings: Partial<storage.AppSettings>) => Promise<void>;
  clearPlaylist: () => Promise<void>;
  clearAllData: () => Promise<void>;
  refreshPlaylist: () => Promise<void>;
  getChannelById: (id: string) => Channel | undefined;
  getChannelsByCategory: (category: string) => Channel[];
  getFavoriteChannels: () => Channel[];
  getFavoriteCategoryChannels: () => Channel[];
  searchChannels: (query: string) => Channel[];
  isCategoryFavorite: (category: string) => boolean;
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [playlists, setPlaylists] = useState<storage.PlaylistInfo[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>([]);
  const [recentChannels, setRecentChannels] = useState<string[]>([]);
  const [settings, setSettings] = useState<storage.AppSettings>({
    autoPlay: true,
    videoQuality: "auto",
    showCategoryFilter: true,
    autoRefreshInterval: "off",
    rememberLastCategory: false,
    lastCategory: "All",
    textSize: "medium",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshTimeRef = useRef<number>(Date.now());

  const channelIndexMap = useMemo(() => {
    if (!playlist) return new Map<string, Channel>();
    const map = new Map<string, Channel>();
    for (const ch of playlist.channels) {
      map.set(ch.id, ch);
    }
    return map;
  }, [playlist]);

  const categoryIndexMap = useMemo(() => {
    if (!playlist) return new Map<string, Channel[]>();
    const map = new Map<string, Channel[]>();
    for (const ch of playlist.channels) {
      const group = ch.group || "";
      const arr = map.get(group);
      if (arr) {
        arr.push(ch);
      } else {
        map.set(group, [ch]);
      }
    }
    return map;
  }, [playlist]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const getRefreshIntervalMs = useCallback((interval: storage.AutoRefreshInterval): number | null => {
    switch (interval) {
      case "5min": return 5 * 60 * 1000;
      case "15min": return 15 * 60 * 1000;
      case "1day": return 24 * 60 * 60 * 1000;
      default: return null;
    }
  }, []);

  const performAutoRefresh = useCallback(async () => {
    if (isLoadingPlaylist) return;
    
    const currentPlaylistInfo = playlists.find(p => p.id === activePlaylistId);
    if (!currentPlaylistInfo) return;

    try {
      if (currentPlaylistInfo.url) {
        const newPlaylist = await fetchAndParseM3U(currentPlaylistInfo.url);
        await storage.savePlaylist(newPlaylist, "m3u");
        setPlaylist(newPlaylist);
        const updatedPlaylists = await storage.getPlaylistList();
        setPlaylists(updatedPlaylists);
      }
      lastRefreshTimeRef.current = Date.now();
    } catch (err) {
      console.warn("Auto-refresh failed:", err);
    }
  }, [activePlaylistId, playlists, isLoadingPlaylist]);

  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    const intervalMs = getRefreshIntervalMs(settings.autoRefreshInterval);
    if (intervalMs && activePlaylistId) {
      autoRefreshTimerRef.current = setInterval(() => {
        performAutoRefresh();
      }, intervalMs);
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [settings.autoRefreshInterval, activePlaylistId, getRefreshIntervalMs, performAutoRefresh]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && settings.autoRefreshInterval !== "off") {
        const intervalMs = getRefreshIntervalMs(settings.autoRefreshInterval);
        if (intervalMs) {
          const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
          if (timeSinceLastRefresh >= intervalMs) {
            performAutoRefresh();
          }
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription?.remove();
  }, [settings.autoRefreshInterval, getRefreshIntervalMs, performAutoRefresh]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [
        savedPlaylists,
        savedActiveId,
        savedFavorites,
        savedFavoriteCategories,
        savedRecent,
        savedSettings,
      ] = await Promise.all([
        storage.getPlaylistList(),
        storage.getActivePlaylistId(),
        storage.getFavorites(),
        storage.getFavoriteCategories(),
        storage.getRecentChannels(),
        storage.getSettings(),
      ]);

      setPlaylists(savedPlaylists);
      setActivePlaylistId(savedActiveId);
      setFavorites(savedFavorites);
      setFavoriteCategories(savedFavoriteCategories);
      setRecentChannels(savedRecent);
      setSettings(savedSettings);

      if (savedActiveId) {
        const savedPlaylist = await storage.getPlaylist(savedActiveId);
        if (savedPlaylist) setPlaylist(savedPlaylist);
      }
    } catch (err) {
      console.error("Error loading initial data:", err);
      setError("Failed to load saved data");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlaylistFromUrl = async (url: string) => {
    try {
      setIsLoadingPlaylist(true);
      setError(null);
      const newPlaylist = await fetchAndParseM3U(url);
      await storage.savePlaylist(newPlaylist, "m3u");
      setPlaylist(newPlaylist);
      setActivePlaylistId(newPlaylist.id);
      const updatedPlaylists = await storage.getPlaylistList();
      setPlaylists(updatedPlaylists);
    } catch (err: any) {
      setError(err.message || "Failed to load playlist");
      throw err;
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  const loadPlaylistFromFile = async (content: string, name: string) => {
    try {
      setIsLoadingPlaylist(true);
      setError(null);
      const newPlaylist = parseM3U(content, name);
      await storage.savePlaylist(newPlaylist, "m3u");
      setPlaylist(newPlaylist);
      setActivePlaylistId(newPlaylist.id);
      const updatedPlaylists = await storage.getPlaylistList();
      setPlaylists(updatedPlaylists);
    } catch (err: any) {
      setError(err.message || "Failed to parse playlist");
      throw err;
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  const switchPlaylist = async (playlistId: string) => {
    try {
      setIsLoadingPlaylist(true);
      const loadedPlaylist = await storage.getPlaylist(playlistId);
      if (loadedPlaylist) {
        setPlaylist(loadedPlaylist);
        setActivePlaylistId(playlistId);
        await storage.setActivePlaylistId(playlistId);
      }
    } catch (err: any) {
      setError(err.message || "Failed to switch playlist");
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  const deletePlaylistFn = async (playlistId: string) => {
    await storage.deletePlaylist(playlistId);
    const updatedPlaylists = await storage.getPlaylistList();
    setPlaylists(updatedPlaylists);
    
    if (activePlaylistId === playlistId) {
      if (updatedPlaylists.length > 0) {
        await switchPlaylist(updatedPlaylists[0].id);
      } else {
        setPlaylist(null);
        setActivePlaylistId(null);
      }
    }
  };

  const toggleFavorite = async (channelId: string) => {
    const newFavorites = await storage.toggleFavorite(channelId);
    setFavorites(newFavorites);
  };

  const toggleFavoriteCategory = async (category: string) => {
    const newFavoriteCategories = await storage.toggleFavoriteCategory(category);
    setFavoriteCategories(newFavoriteCategories);
  };

  const isCategoryFavorite = useCallback(
    (category: string): boolean => {
      return favoriteCategories.includes(category);
    },
    [favoriteCategories]
  );

  const addToRecent = async (channelId: string) => {
    await storage.addRecentChannel(channelId);
    await storage.setLastPlayedChannel(channelId);
    const recent = await storage.getRecentChannels();
    setRecentChannels(recent);
  };

  const updateSettings = async (newSettings: Partial<storage.AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    await storage.saveSettings(updated);
    setSettings(updated);
  };

  const clearPlaylist = async () => {
    if (activePlaylistId) {
      await storage.deletePlaylist(activePlaylistId);
      const updatedPlaylists = await storage.getPlaylistList();
      setPlaylists(updatedPlaylists);
      
      if (updatedPlaylists.length > 0) {
        await switchPlaylist(updatedPlaylists[0].id);
      } else {
        setPlaylist(null);
        setActivePlaylistId(null);
      }
    }
  };

  const clearAllData = async () => {
    await storage.clearAllData();
    setPlaylist(null);
    setPlaylists([]);
    setActivePlaylistId(null);
    setFavorites([]);
    setFavoriteCategories([]);
    setRecentChannels([]);
    setSettings({
      autoPlay: true,
      videoQuality: "auto",
      showCategoryFilter: true,
      autoRefreshInterval: "off",
      rememberLastCategory: false,
      lastCategory: "All",
      textSize: "medium",
    });
  };

  const refreshPlaylist = async () => {
    const currentPlaylistInfo = playlists.find(p => p.id === activePlaylistId);
    if (!currentPlaylistInfo) return;

    if (currentPlaylistInfo.url) {
      await loadPlaylistFromUrl(currentPlaylistInfo.url);
    }
  };

  const getChannelById = useCallback(
    (id: string): Channel | undefined => {
      return channelIndexMap.get(id);
    },
    [channelIndexMap]
  );

  const getChannelsByCategory = useCallback(
    (category: string): Channel[] => {
      if (!playlist) return [];
      if (category === "All") return playlist.channels;
      return categoryIndexMap.get(category) || [];
    },
    [playlist, categoryIndexMap]
  );

  const getFavoriteChannels = useCallback((): Channel[] => {
    if (!playlist) return [];
    return playlist.channels.filter((ch) => favorites.includes(ch.id));
  }, [playlist, favorites]);

  const getFavoriteCategoryChannels = useCallback((): Channel[] => {
    if (!playlist) return [];
    return playlist.channels.filter((ch) => favoriteCategories.includes(ch.group));
  }, [playlist, favoriteCategories]);

  const searchChannels = useCallback(
    (query: string): Channel[] => {
      if (!playlist || !query.trim()) return [];
      const lowerQuery = query.toLowerCase();
      return playlist.channels.filter(
        (ch) =>
          ch.name.toLowerCase().includes(lowerQuery) ||
          ch.group.toLowerCase().includes(lowerQuery)
      );
    },
    [playlist]
  );

  return (
    <PlaylistContext.Provider
      value={{
        playlist,
        playlists,
        activePlaylistId,
        favorites,
        favoriteCategories,
        recentChannels,
        settings,
        isLoading,
        isLoadingPlaylist,
        cancelLoading: () => setIsLoadingPlaylist(false),
        error,
        loadPlaylistFromUrl,
        loadPlaylistFromFile,
        switchPlaylist,
        deletePlaylist: deletePlaylistFn,
        toggleFavorite,
        toggleFavoriteCategory,
        addToRecent,
        updateSettings,
        clearPlaylist,
        clearAllData,
        refreshPlaylist,
        getChannelById,
        getChannelsByCategory,
        getFavoriteChannels,
        getFavoriteCategoryChannels,
        searchChannels,
        isCategoryFavorite,
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylist() {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error("usePlaylist must be used within a PlaylistProvider");
  }
  return context;
}
