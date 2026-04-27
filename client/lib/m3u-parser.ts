import { Channel, Playlist, DRMInfo } from "@/types/playlist";
import { Platform } from "react-native";

function generateId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/** Stable ID derived from a channel's stream URL so it survives playlist refreshes. */
function stableChannelId(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return "ch_" + h.toString(36);
}

function parseDRM(
  lines: string[],
  currentIndex: number,
  url: string,
): { drm?: DRMInfo; headers?: Record<string, string> } {
  const drm: DRMInfo = {};
  const headers: Record<string, string> = {};
  let foundDRM = false;
  let foundHeaders = false;

  for (let i = Math.max(0, currentIndex - 5); i < currentIndex; i++) {
    const line = lines[i];

    if (line.includes("#KODIPROP:inputstream.adaptive.license_type=")) {
      const type = line.split("=")[1]?.toLowerCase().trim();
      if (type?.includes("widevine")) drm.type = "widevine";
      else if (type?.includes("playready")) drm.type = "playready";
      else if (type?.includes("clearkey")) drm.type = "clearkey";
      // FairPlay removed - not supported on Android
      foundDRM = true;
    }

    if (line.includes("#KODIPROP:inputstream.adaptive.license_key=")) {
      drm.licenseServer = line.split("=").slice(1).join("=").trim();
      foundDRM = true;
    }

    if (line.includes("#EXTVLCOPT:http-user-agent=")) {
      headers["User-Agent"] = line.split("=").slice(1).join("=").trim();
      foundHeaders = true;
    }

    if (line.includes("#EXTVLCOPT:http-referrer=")) {
      headers["Referer"] = line.split("=").slice(1).join("=").trim();
      foundHeaders = true;
    }

    if (line.includes("#EXTVLCOPT:http-origin=")) {
      headers["Origin"] = line.split("=").slice(1).join("=").trim();
      foundHeaders = true;
    }
  }

  if (!foundDRM && url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.searchParams.has("hdnea")) {
        drm.type = "widevine";
        const hdntl = urlObj.searchParams.get("hdntl");
        const hdnea = urlObj.searchParams.get("hdnea");
        drm.licenseServer = hdntl || undefined;
        if (hdnea) headers["Authorization"] = hdnea;
        if (drm.licenseServer || headers["Authorization"]) {
          foundDRM = true;
        }
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  // Attach headers to DRM object for license requests
  if (foundDRM && foundHeaders) {
    drm.headers = headers;
  }

  return {
    drm: foundDRM ? drm : undefined,
    headers: foundHeaders && !foundDRM ? headers : undefined,
  };
}

/**
 * Parses VLC-style URL headers (e.g., `http://stream.url|User-Agent:foo|Referer:bar`)
 * Returns the clean URL and a headers record.
 */
function parseUrlHeaders(url: string): { cleanUrl: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  let cleanUrl = url;

  const pipeIndex = url.indexOf('|');
  if (pipeIndex !== -1) {
    cleanUrl = url.substring(0, pipeIndex);
    const headerPart = url.substring(pipeIndex + 1);
    const headerEntries = headerPart.split('|');
    for (const entry of headerEntries) {
      const colonIndex = entry.indexOf(':');
      if (colonIndex !== -1) {
        const headerName = entry.substring(0, colonIndex).trim();
        const headerValue = entry.substring(colonIndex + 1).trim();
        if (headerName && headerValue) {
          // Normalize common header names
          const normalized = headerName.toLowerCase() === 'user-agent' ? 'User-Agent'
            : headerName.toLowerCase() === 'referer' ? 'Referer'
            : headerName.toLowerCase() === 'origin' ? 'Origin'
            : headerName;
          headers[normalized] = headerValue;
        }
      }
    }
  }

  return { cleanUrl, headers };
}

function parseExtInf(line: string): Partial<Channel> {
  const channel: Partial<Channel> = {};

  const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
  if (tvgIdMatch) channel.tvgId = tvgIdMatch[1];

  const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);
  if (tvgNameMatch) channel.tvgName = tvgNameMatch[1];

  const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
  if (tvgLogoMatch) channel.logo = tvgLogoMatch[1];

  const groupMatch = line.match(/group-title="([^"]*)"/i);
  if (groupMatch) channel.group = groupMatch[1];

  const qualityMatch = line.match(
    /\b(4K|UHD|FHD|HD|SD|720p|1080p|480p|360p)\b/i,
  );
  if (qualityMatch) channel.quality = qualityMatch[1].toUpperCase();

  const nameMatch = line.match(/,(.+)$/);
  if (nameMatch) channel.name = nameMatch[1].trim();

  return channel;
}

export function parseM3U(
  content: string,
  playlistName: string = "My Playlist",
): Playlist {
  const lines = content.split("\n").map((line) => line.trim());
  const channels: Channel[] = [];
  const categoriesSet = new Set<string>();

  let currentChannel: Partial<Channel> = {};
  let extinfIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#EXTINF:")) {
      currentChannel = parseExtInf(line);
      extinfIndex = i;
    } else if (line && !line.startsWith("#") && currentChannel.name) {
      const { drm, headers } = parseDRM(lines, i, line);

      const { cleanUrl, urlHeaders } = parseUrlHeaders(line);

      // Merge headers from EXTVLCOPT and URL syntax, URL syntax takes precedence
      const mergedHeaders = headers ? { ...headers, ...urlHeaders } : Object.keys(urlHeaders).length > 0 ? urlHeaders : undefined;

      const channel: Channel = {
        id: stableChannelId(cleanUrl),
        name: currentChannel.name || "Unknown Channel",
        url: cleanUrl,
        logo: currentChannel.logo,
        group: currentChannel.group || "Uncategorized",
        tvgId: currentChannel.tvgId,
        tvgName: currentChannel.tvgName,
        quality: currentChannel.quality,
        drm: drm,
        headers: mergedHeaders,
        isLive: true,
      };

      channels.push(channel);
      categoriesSet.add(channel.group);
      currentChannel = {};
      extinfIndex = -1;
    }
  }

  const categories = Array.from(categoriesSet).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  return {
    id: generateId(),
    name: playlistName,
    channels,
    categories,
    lastUpdated: Date.now(),
  };
}

export const PRYSM_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchPlaylistContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": PRYSM_USER_AGENT,
        Accept: "*/*",
      },
    });

    if (response.ok) {
      const content = await response.text();
      if (content.includes("#EXTM3U") || content.includes("#EXTINF")) {
        return content;
      }
    }
  } catch (e) {
    // Fetch failed
  }
  return null;
}

export async function fetchAndParseM3U(
  url: string,
  customName?: string,
): Promise<Playlist> {
  const content = await fetchPlaylistContent(url);

  if (!content) {
    throw new Error(
      "Could not fetch playlist. The server may be blocking requests or require specific app authentication.",
    );
  }

  const urlParts = url.split("/");
  const fileName = urlParts[urlParts.length - 1]
    .split("?")[0]
    .replace(".m3u", "")
    .replace(".m3u8", "");
  const playlistName = customName || fileName || "Remote Playlist";

  const playlist = parseM3U(content, playlistName);
  playlist.url = url;

  return playlist;
}

/**
 * Parses PLS (Playlist) format
 * Example:
 * [playlist]
 * NumberOfEntries=2
 * File1=http://stream1.url
 * Title1=Channel 1
 * Length1=-1
 */
export function parsePLS(content: string, playlistName: string = "My Playlist"): Playlist {
  const lines = content.split("\n").map((line) => line.trim());
  const channels: Channel[] = [];
  const categoriesSet = new Set<string>();

  let currentTitle = "";
  let currentGroup = "";

  for (const line of lines) {
    if (line.toLowerCase().startsWith("file")) {
      const urlMatch = line.match(/file\d*=(.+)/i);
      if (urlMatch) {
        const url = urlMatch[1].trim();
        const { cleanUrl, urlHeaders } = parseUrlHeaders(url);
        const channel: Channel = {
          id: stableChannelId(cleanUrl),
          name: currentTitle || "Unknown Channel",
          url: cleanUrl,
          logo: undefined,
          group: currentGroup || "Uncategorized",
          tvgId: undefined,
          tvgName: undefined,
          quality: undefined,
          drm: undefined,
          headers: Object.keys(urlHeaders).length > 0 ? urlHeaders : undefined,
          isLive: true,
        };
        channels.push(channel);
        categoriesSet.add(channel.group);
        currentTitle = "";
      }
    } else if (line.toLowerCase().startsWith("title")) {
      const titleMatch = line.match(/title\d*=(.+)/i);
      if (titleMatch) {
        currentTitle = titleMatch[1].trim();
        // Try to extract group from title if it has a format like "Group - Channel"
        const groupMatch = currentTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (groupMatch) {
          currentGroup = groupMatch[1].trim();
          currentTitle = groupMatch[2].trim();
        }
      }
    } else if (line.toLowerCase().startsWith("group")) {
      const groupMatch = line.match(/group\d*=(.+)/i);
      if (groupMatch) {
        currentGroup = groupMatch[1].trim();
      }
    }
  }

  const categories = Array.from(categoriesSet).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  return {
    id: generateId(),
    name: playlistName,
    channels,
    categories,
    lastUpdated: Date.now(),
  };
}

/**
 * Parses XSPF (XML Shareable Playlist Format) format
 * Example:
 * <?xml version="1.0" encoding="UTF-8"?>
 * <playlist>
 *   <trackList>
 *     <track>
 *       <title>Channel 1</title>
 *       <location>http://stream1.url</location>
 *       <image>http://logo.url</image>
 *     </track>
 *   </trackList>
 * </playlist>
 */
export function parseXSPF(content: string, playlistName: string = "My Playlist"): Playlist {
  const channels: Channel[] = [];
  const categoriesSet = new Set<string>();

  // Simple XML parsing without DOM (works in React Native)
  const trackRegex = /<track>([\s\S]*?)<\/track>/gi;
  let match;

  while ((match = trackRegex.exec(content)) !== null) {
    const trackContent = match[1];

    const titleMatch = trackContent.match(/<title>([^<]*)<\/title>/i);
    const locationMatch = trackContent.match(/<location>([^<]*)<\/location>/i);
    const imageMatch = trackContent.match(/<image>([^<]*)<\/image>/i);
    const creatorMatch = trackContent.match(/<creator>([^<]*)<\/creator>/i);
    const annotationMatch = trackContent.match(/<annotation>([^<]*)<\/annotation>/i);

    if (locationMatch) {
      const url = locationMatch[1].trim();
      const { cleanUrl, urlHeaders } = parseUrlHeaders(url);

      let group = creatorMatch ? creatorMatch[1].trim() : "Uncategorized";
      if (annotationMatch && !creatorMatch) {
        group = annotationMatch[1].trim();
      }

      const channel: Channel = {
        id: stableChannelId(cleanUrl),
        name: titleMatch ? titleMatch[1].trim() : "Unknown Channel",
        url: cleanUrl,
        logo: imageMatch ? imageMatch[1].trim() : undefined,
        group,
        tvgId: undefined,
        tvgName: undefined,
        quality: undefined,
        drm: undefined,
        headers: Object.keys(urlHeaders).length > 0 ? urlHeaders : undefined,
        isLive: true,
      };
      channels.push(channel);
      categoriesSet.add(channel.group);
    }
  }

  const categories = Array.from(categoriesSet).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  return {
    id: generateId(),
    name: playlistName,
    channels,
    categories,
    lastUpdated: Date.now(),
  };
}

/**
 * Detects playlist format and parses accordingly
 */
export function parsePlaylist(content: string, playlistName: string = "My Playlist"): Playlist {
  const trimmed = content.trim();

  // Check for M3U/M3U8
  if (trimmed.startsWith("#EXTM3U") || trimmed.includes("#EXTINF:")) {
    return parseM3U(content, playlistName);
  }

  // Check for PLS
  if (trimmed.toLowerCase().includes("[playlist]") || trimmed.toLowerCase().includes("numberofentries=")) {
    return parsePLS(content, playlistName);
  }

  // Check for XSPF (XML-based)
  if (trimmed.includes("<playlist") && trimmed.includes("<tracklist>")) {
    return parseXSPF(content, playlistName);
  }

  // Try to detect JSON-based playlists (some IPTV providers use JSON)
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parseJSONArray(parsed, playlistName);
    }
    if (parsed.channels && Array.isArray(parsed.channels)) {
      return parseJSONArray(parsed.channels, playlistName);
    }
  } catch {
    // Not JSON
  }

  throw new Error("Unsupported playlist format. Supported formats: M3U, M3U8, PLS, XSPF, JSON");
}

/**
 * Parses a JSON array of channels
 * Expected format: [{ name, url, logo?, group? }, ...]
 */
function parseJSONArray(items: any[], playlistName: string = "My Playlist"): Playlist {
  const channels: Channel[] = [];
  const categoriesSet = new Set<string>();

  for (const item of items) {
    if (!item.url) continue;

    const url = typeof item.url === "string" ? item.url : "";
    const { cleanUrl, urlHeaders } = parseUrlHeaders(url);

    const channel: Channel = {
      id: stableChannelId(cleanUrl),
      name: item.name || item.title || "Unknown Channel",
      url: cleanUrl,
      logo: item.logo || item.image || item.tvgLogo || undefined,
      group: item.group || item.category || item.groupTitle || "Uncategorized",
      tvgId: item.tvgId || item.epgId || undefined,
      tvgName: item.tvgName || undefined,
      quality: item.quality || undefined,
      drm: item.drm || undefined,
      headers: Object.keys(urlHeaders).length > 0 ? urlHeaders : undefined,
      isLive: item.isLive !== false,
    };
    channels.push(channel);
    categoriesSet.add(channel.group);
  }

  const categories = Array.from(categoriesSet).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  return {
    id: generateId(),
    name: playlistName,
    channels,
    categories,
    lastUpdated: Date.now(),
  };
}

/**
 * Fetches and parses any playlist format
 */
export async function fetchAndParsePlaylist(url: string, customName?: string): Promise<Playlist> {
  let content: string;

  if (Platform.OS === "android") {
    // Use native OkHttp fetcher — React Native's fetch strips User-Agent on Android
    const { nativeFetchPlaylist } = require("../../modules/tv-player/src/index");
    content = await nativeFetchPlaylist(url);
  } else {
    const response = await fetch(url, {
      headers: {
        "User-Agent": PRYSM_USER_AGENT,
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      throw new Error(
        "Could not fetch playlist. The server may be blocking requests or require specific app authentication.",
      );
    }
    content = await response.text();
  }

  const urlParts = url.split("/");
  const fileName = urlParts[urlParts.length - 1]
    .split("?")[0]
    .replace(/\.(m3u8?|pls|xspf|json)$/i, "");
  const playlistName = customName || fileName || "Remote Playlist";

  const playlist = parsePlaylist(content, playlistName);
  playlist.url = url;

  return playlist;
}

export { parseM3U, fetchAndParseM3U, parsePLS, parseXSPF, parsePlaylist, fetchAndParsePlaylist };
