import AsyncStorage from "@react-native-async-storage/async-storage";
import { Playlist, Channel } from "@/types/playlist";

const STORAGE_KEYS = {
  PLAYLISTS: "prysm_playlists",
  ACTIVE_PLAYLIST_ID: "prysm_active_playlist",
  PLAYLIST_META: "prysm_playlist_meta_",
  PLAYLIST_CHUNKS: "prysm_playlist_chunks_",
  FAVORITES: "prysm_favorites",
  FAVORITE_CATEGORIES: "prysm_favorite_categories",
  RECENT: "prysm_recent",
  LAST_PLAYED: "prysm_last_played",
  SETTINGS: "prysm_settings",
  NETWORK_STREAM: "prysm_network_stream",
};

const CHUNK_SIZE = 300;

export type PlaylistType = "m3u" | "xtream";

export interface PlaylistInfo {
  id: string;
  name: string;
  type: PlaylistType;
  url?: string;
  xtreamCredentials?: {
    server: string;
    username: string;
    password: string;
  };
  channelCount: number;
  lastUpdated: number;
}

export type AutoRefreshInterval = "off" | "5min" | "15min" | "1day";
export type TextSizeOption = "small" | "medium" | "large";
export type DrmScheme = "widevine" | "playready" | "clearkey";
export type UserAgent =
  | "chrome"
  | "firefox"
  | "safari"
  | "iphone"
  | "android"
  | "smarttv"
  | "custom";

export interface NetworkStreamConfig {
  url: string;
  cookie: string;
  referer: string;
  origin: string;
  /** Either a full license URL or a base64/hex raw key */
  drmLicenseUrl: string;
  userAgent: UserAgent;
  customUserAgent: string;
  drmScheme: DrmScheme;
}

export const DEFAULT_NETWORK_STREAM: NetworkStreamConfig = {
  url: "",
  cookie: "",
  referer: "",
  origin: "",
  drmLicenseUrl: "",
  userAgent: "chrome",
  customUserAgent: "",
  drmScheme: "widevine",
};

export const USER_AGENT_STRINGS: Record<UserAgent, string> = {
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  smarttv:
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/7.0 TV Safari/538.1",
  custom: "",
};

export interface AppSettings {
  autoPlay: boolean;
  videoQuality: "auto" | "high" | "medium" | "low";
  showCategoryFilter: boolean;
  autoRefreshInterval: AutoRefreshInterval;
  rememberLastCategory: boolean;
  lastCategory: string;
  textSize: TextSizeOption;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoPlay: true,
  videoQuality: "auto",
  showCategoryFilter: true,
  autoRefreshInterval: "off",
  rememberLastCategory: false,
  lastCategory: "All",
  textSize: "medium",
};

interface PlaylistMeta {
  id: string;
  name: string;
  type: PlaylistType;
  url?: string;
  xtreamCredentials?: {
    server: string;
    username: string;
    password: string;
  };
  categories: string[];
  lastUpdated: number;
  totalChannels: number;
  chunkCount: number;
}

interface MinimalChannel {
  i: string;
  n: string;
  u: string;
  l?: string;
  g: string;
}

function minimizeChannel(channel: Channel): MinimalChannel {
  const min: MinimalChannel = {
    i: channel.id,
    n: channel.name,
    u: channel.url,
    g: channel.group,
  };
  if (channel.logo) min.l = channel.logo;
  return min;
}

function expandChannel(min: MinimalChannel): Channel {
  return {
    id: min.i,
    name: min.n,
    url: min.u,
    group: min.g,
    logo: min.l,
  };
}

export async function getPlaylistList(): Promise<PlaylistInfo[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PLAYLISTS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting playlist list:", error);
    return [];
  }
}

export async function savePlaylistList(
  playlists: PlaylistInfo[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.PLAYLISTS,
      JSON.stringify(playlists),
    );
  } catch (error) {
    console.error("Error saving playlist list:", error);
  }
}

export async function getActivePlaylistId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
  } catch (error) {
    console.error("Error getting active playlist:", error);
    return null;
  }
}

export async function setActivePlaylistId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID, id);
  } catch (error) {
    console.error("Error setting active playlist:", error);
  }
}

export async function clearAllData(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prysmKeys = allKeys.filter(
      (key) => key.startsWith("prysm_") || key.startsWith("iptv_"),
    );
    if (prysmKeys.length > 0) {
      await AsyncStorage.multiRemove(prysmKeys);
    }
  } catch (error) {
    console.error("Error clearing all data:", error);
  }
}

export async function savePlaylist(
  playlist: Playlist,
  type: PlaylistType = "m3u",
  xtreamCredentials?: PlaylistInfo["xtreamCredentials"],
): Promise<void> {
  try {
    const channels = playlist.channels;
    const chunkCount = Math.ceil(channels.length / CHUNK_SIZE);

    const meta: PlaylistMeta = {
      id: playlist.id,
      name: playlist.name,
      type,
      url: playlist.url,
      xtreamCredentials,
      categories: playlist.categories.slice(0, 50),
      lastUpdated: playlist.lastUpdated,
      totalChannels: channels.length,
      chunkCount,
    };

    await AsyncStorage.setItem(
      `${STORAGE_KEYS.PLAYLIST_META}${playlist.id}`,
      JSON.stringify(meta),
    );

    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, channels.length);
      const chunk = channels.slice(start, end).map(minimizeChannel);

      try {
        await AsyncStorage.setItem(
          `${STORAGE_KEYS.PLAYLIST_CHUNKS}${playlist.id}_${i}`,
          JSON.stringify(chunk),
        );
      } catch (chunkError: any) {
        if (
          chunkError.message?.includes("disk is full") ||
          chunkError.code === 13
        ) {
          console.warn(`Storage full at chunk ${i}, stopping save`);
          meta.chunkCount = i;
          meta.totalChannels = i * CHUNK_SIZE;
          await AsyncStorage.setItem(
            `${STORAGE_KEYS.PLAYLIST_META}${playlist.id}`,
            JSON.stringify(meta),
          );
          break;
        }
        throw chunkError;
      }
    }

    const playlists = await getPlaylistList();
    const existingIndex = playlists.findIndex((p) => p.id === playlist.id);
    const playlistInfo: PlaylistInfo = {
      id: playlist.id,
      name: playlist.name,
      type,
      url: playlist.url,
      xtreamCredentials,
      channelCount: meta.totalChannels,
      lastUpdated: meta.lastUpdated,
    };

    if (existingIndex >= 0) {
      playlists[existingIndex] = playlistInfo;
    } else {
      playlists.push(playlistInfo);
    }
    await savePlaylistList(playlists);
    await setActivePlaylistId(playlist.id);
  } catch (error: any) {
    console.error("Error saving playlist:", error);
    if (error.message?.includes("disk is full") || error.code === 13) {
      throw new Error(
        "Device storage is full. Please free up some space or use a smaller playlist.",
      );
    }
    throw error;
  }
}

export async function getPlaylist(
  playlistId?: string,
): Promise<Playlist | null> {
  try {
    const id = playlistId || (await getActivePlaylistId());
    if (!id) return null;

    const metaStr = await AsyncStorage.getItem(
      `${STORAGE_KEYS.PLAYLIST_META}${id}`,
    );
    if (!metaStr) return null;

    const meta: PlaylistMeta = JSON.parse(metaStr);
    const channels: Channel[] = [];

    for (let i = 0; i < meta.chunkCount; i++) {
      try {
        const chunkStr = await AsyncStorage.getItem(
          `${STORAGE_KEYS.PLAYLIST_CHUNKS}${id}_${i}`,
        );
        if (chunkStr) {
          const chunk: MinimalChannel[] = JSON.parse(chunkStr);
          channels.push(...chunk.map(expandChannel));
        }
      } catch (chunkError) {
        console.warn(`Error reading chunk ${i}:`, chunkError);
      }
    }

    return {
      id: meta.id,
      name: meta.name,
      url: meta.url,
      categories: meta.categories,
      lastUpdated: meta.lastUpdated,
      channels,
    };
  } catch (error) {
    console.error("Error getting playlist:", error);
    return null;
  }
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  try {
    const metaStr = await AsyncStorage.getItem(
      `${STORAGE_KEYS.PLAYLIST_META}${playlistId}`,
    );
    if (metaStr) {
      const meta: PlaylistMeta = JSON.parse(metaStr);
      const keysToRemove = [`${STORAGE_KEYS.PLAYLIST_META}${playlistId}`];
      for (let i = 0; i < meta.chunkCount; i++) {
        keysToRemove.push(`${STORAGE_KEYS.PLAYLIST_CHUNKS}${playlistId}_${i}`);
      }
      await AsyncStorage.multiRemove(keysToRemove);
    }

    const playlists = await getPlaylistList();
    const filtered = playlists.filter((p) => p.id !== playlistId);
    await savePlaylistList(filtered);

    const activeId = await getActivePlaylistId();
    if (activeId === playlistId) {
      if (filtered.length > 0) {
        await setActivePlaylistId(filtered[0].id);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
      }
    }
  } catch (error) {
    console.error("Error deleting playlist:", error);
  }
}

export async function updatePlaylistInfo(
  playlistId: string,
  name: string,
  url?: string,
): Promise<void> {
  try {
    const metaStr = await AsyncStorage.getItem(
      `${STORAGE_KEYS.PLAYLIST_META}${playlistId}`,
    );
    if (metaStr) {
      const meta: PlaylistMeta = JSON.parse(metaStr);
      meta.name = name;
      if (url !== undefined) {
        meta.url = url;
      }
      await AsyncStorage.setItem(
        `${STORAGE_KEYS.PLAYLIST_META}${playlistId}`,
        JSON.stringify(meta),
      );
    }

    const playlists = await getPlaylistList();
    const playlistIndex = playlists.findIndex((p) => p.id === playlistId);
    if (playlistIndex >= 0) {
      playlists[playlistIndex].name = name;
      if (url !== undefined) {
        playlists[playlistIndex].url = url;
      }
      await savePlaylistList(playlists);
    }
  } catch (error) {
    console.error("Error updating playlist info:", error);
    throw error;
  }
}

export async function clearPlaylist(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const playlistKeys = allKeys.filter(
      (key) =>
        key.startsWith(STORAGE_KEYS.PLAYLIST_META) ||
        key.startsWith(STORAGE_KEYS.PLAYLIST_CHUNKS),
    );
    if (playlistKeys.length > 0) {
      await AsyncStorage.multiRemove(playlistKeys);
    }
    await AsyncStorage.removeItem(STORAGE_KEYS.PLAYLISTS);
    await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
  } catch (error) {
    console.error("Error clearing playlist:", error);
  }
}

export async function getFavorites(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting favorites:", error);
    return [];
  }
}

export async function saveFavorites(favorites: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.FAVORITES,
      JSON.stringify(favorites),
    );
  } catch (error) {
    console.error("Error saving favorites:", error);
  }
}

export async function toggleFavorite(channelId: string): Promise<string[]> {
  const favorites = await getFavorites();
  const index = favorites.indexOf(channelId);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(channelId);
  }
  await saveFavorites(favorites);
  return favorites;
}

export async function getRecentChannels(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting recent channels:", error);
    return [];
  }
}

export async function addRecentChannel(channelId: string): Promise<void> {
  try {
    let recent = await getRecentChannels();
    recent = recent.filter((id) => id !== channelId);
    recent.unshift(channelId);
    recent = recent.slice(0, 20);
    await AsyncStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(recent));
  } catch (error) {
    console.error("Error adding recent channel:", error);
  }
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
      : DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error getting settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

export async function getLastPlayedChannel(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.LAST_PLAYED);
  } catch (error) {
    console.error("Error getting last played:", error);
    return null;
  }
}

export async function setLastPlayedChannel(channelId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_PLAYED, channelId);
  } catch (error) {
    console.error("Error setting last played:", error);
  }
}

export async function getFavoriteCategories(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITE_CATEGORIES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting favorite categories:", error);
    return [];
  }
}

export async function saveFavoriteCategories(
  categories: string[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.FAVORITE_CATEGORIES,
      JSON.stringify(categories),
    );
  } catch (error) {
    console.error("Error saving favorite categories:", error);
  }
}

export async function toggleFavoriteCategory(
  category: string,
): Promise<string[]> {
  const categories = await getFavoriteCategories();
  const index = categories.indexOf(category);
  if (index > -1) {
    categories.splice(index, 1);
  } else {
    categories.push(category);
  }
  await saveFavoriteCategories(categories);
  return categories;
}

export async function getNetworkStreamConfig(): Promise<NetworkStreamConfig> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NETWORK_STREAM);
    return data
      ? { ...DEFAULT_NETWORK_STREAM, ...JSON.parse(data) }
      : DEFAULT_NETWORK_STREAM;
  } catch (error) {
    console.error("Error getting network stream config:", error);
    return DEFAULT_NETWORK_STREAM;
  }
}

export async function saveNetworkStreamConfig(
  config: NetworkStreamConfig,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.NETWORK_STREAM,
      JSON.stringify(config),
    );
  } catch (error) {
    console.error("Error saving network stream config:", error);
  }
}
