import { VideoQuality } from "@/components/AdvancedVideoPlayer";

interface HLSVariant {
  bandwidth: number;
  resolution?: { width: number; height: number };
  url: string;
  name?: string;
}

export async function parseHLSQualities(masterPlaylistUrl: string): Promise<VideoQuality[]> {
  try {
    const response = await fetch(masterPlaylistUrl, {
      headers: {
        "Accept": "*/*",
      },
    });

    if (!response.ok) {
      console.warn("Failed to fetch HLS manifest:", response.status);
      return [];
    }

    const content = await response.text();
    return parseHLSManifest(content, masterPlaylistUrl);
  } catch (error) {
    console.warn("Error parsing HLS qualities:", error);
    return [];
  }
}

function parseHLSManifest(content: string, baseUrl: string): VideoQuality[] {
  const lines = content.split("\n").map((line) => line.trim());
  const variants: HLSVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attributes = parseAttributes(line.substring("#EXT-X-STREAM-INF:".length));
      const urlLine = lines[i + 1];

      if (urlLine && !urlLine.startsWith("#")) {
        const variant: HLSVariant = {
          bandwidth: parseInt(attributes.BANDWIDTH || "0", 10),
          url: resolveUrl(urlLine, baseUrl),
        };

        if (attributes.RESOLUTION) {
          const [width, height] = attributes.RESOLUTION.split("x").map(Number);
          variant.resolution = { width, height };
        }

        if (attributes.NAME) {
          variant.name = attributes.NAME.replace(/"/g, "");
        }

        variants.push(variant);
      }
    }
  }

  if (variants.length === 0) {
    return [];
  }

  variants.sort((a, b) => b.bandwidth - a.bandwidth);

  const qualities: VideoQuality[] = variants.map((variant) => {
    let label: string;
    let resolution: string;

    if (variant.resolution) {
      const height = variant.resolution.height;
      if (height >= 2160) {
        label = "4K";
        resolution = "2160p";
      } else if (height >= 1440) {
        label = "1440p";
        resolution = "1440p";
      } else if (height >= 1080) {
        label = "1080p";
        resolution = "1080p";
      } else if (height >= 720) {
        label = "720p";
        resolution = "720p";
      } else if (height >= 480) {
        label = "480p";
        resolution = "480p";
      } else if (height >= 360) {
        label = "360p";
        resolution = "360p";
      } else {
        label = `${height}p`;
        resolution = `${height}p`;
      }
    } else {
      const kbps = Math.round(variant.bandwidth / 1000);
      if (kbps >= 8000) {
        label = "High";
        resolution = "High Quality";
      } else if (kbps >= 4000) {
        label = "Medium-High";
        resolution = "Medium-High";
      } else if (kbps >= 2000) {
        label = "Medium";
        resolution = "Medium Quality";
      } else if (kbps >= 1000) {
        label = "Low";
        resolution = "Low Quality";
      } else {
        label = "Very Low";
        resolution = "Very Low Quality";
      }
    }

    return {
      label: variant.name || label,
      resolution,
      bitrate: variant.bandwidth,
      url: variant.url,
    };
  });

  const uniqueQualities = qualities.reduce((acc: VideoQuality[], quality) => {
    const exists = acc.find((q) => q.resolution === quality.resolution);
    if (!exists) {
      acc.push(quality);
    } else if (quality.bitrate && exists.bitrate && quality.bitrate > exists.bitrate) {
      const index = acc.indexOf(exists);
      acc[index] = quality;
    }
    return acc;
  }, []);

  return uniqueQualities;
}

function parseAttributes(attributeString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match;

  while ((match = regex.exec(attributeString)) !== null) {
    const key = match[1];
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    attributes[key] = value;
  }

  return attributes;
}

function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  try {
    const base = new URL(baseUrl);
    if (url.startsWith("/")) {
      return `${base.protocol}//${base.host}${url}`;
    } else {
      const basePath = base.pathname.substring(0, base.pathname.lastIndexOf("/") + 1);
      return `${base.protocol}//${base.host}${basePath}${url}`;
    }
  } catch {
    return url;
  }
}

export function isHLSStream(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes(".m3u8") || lowerUrl.includes("/hls/") || lowerUrl.includes("playlist");
}
