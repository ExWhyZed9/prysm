import { Channel, Playlist, DRMInfo } from "@/types/playlist";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function parseDRM(lines: string[], currentIndex: number): { drm?: DRMInfo; headers?: Record<string, string> } {
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
      else if (type?.includes("fairplay")) drm.type = "fairplay";
      else if (type?.includes("clearkey")) drm.type = "clearkey";
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
  }
  
  return {
    drm: foundDRM ? drm : undefined,
    headers: foundHeaders ? headers : undefined,
  };
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
  
  const qualityMatch = line.match(/\b(4K|UHD|FHD|HD|SD|720p|1080p|480p|360p)\b/i);
  if (qualityMatch) channel.quality = qualityMatch[1].toUpperCase();
  
  const nameMatch = line.match(/,(.+)$/);
  if (nameMatch) channel.name = nameMatch[1].trim();
  
  return channel;
}

export function parseM3U(content: string, playlistName: string = "My Playlist"): Playlist {
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
      const { drm, headers } = parseDRM(lines, i);
      
      const channel: Channel = {
        id: generateId(),
        name: currentChannel.name || "Unknown Channel",
        url: line,
        logo: currentChannel.logo,
        group: currentChannel.group || "Uncategorized",
        tvgId: currentChannel.tvgId,
        tvgName: currentChannel.tvgName,
        quality: currentChannel.quality,
        drm: drm,
        headers: headers,
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

export const PRYSM_USER_AGENT = "Prysm/1.0.0";

async function fetchPlaylistContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": PRYSM_USER_AGENT,
        "Accept": "*/*",
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

export async function fetchAndParseM3U(url: string): Promise<Playlist> {
  const content = await fetchPlaylistContent(url);
  
  if (!content) {
    throw new Error("Could not fetch playlist. The server may be blocking requests or require specific app authentication.");
  }
  
  const urlParts = url.split("/");
  const fileName = urlParts[urlParts.length - 1].split("?")[0].replace(".m3u", "").replace(".m3u8", "");
  const playlistName = fileName || "Remote Playlist";
  
  const playlist = parseM3U(content, playlistName);
  playlist.url = url;
  
  return playlist;
}
