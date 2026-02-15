export interface DRMInfo {
  type?: "widevine" | "fairplay" | "playready" | "clearkey";
  licenseServer?: string;
  headers?: Record<string, string>;
  certificateUrl?: string;
}

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  tvgId?: string;
  tvgName?: string;
  drm?: DRMInfo;
  headers?: Record<string, string>;
  isLive?: boolean;
  quality?: string;
}

export interface Playlist {
  id: string;
  name: string;
  url?: string;
  channels: Channel[];
  categories: string[];
  lastUpdated: number;
}

export interface PlaylistState {
  currentPlaylist: Playlist | null;
  favorites: string[];
  recentChannels: string[];
  lastPlayedChannel: string | null;
}
