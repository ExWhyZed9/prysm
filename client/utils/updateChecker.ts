import * as Application from "expo-application";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { Platform } from "react-native";

const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/ExWhyZed9/prysm/releases/latest";
const APK_DOWNLOAD_DIR = FileSystemLegacy.documentDirectory;

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  apkUrl: string;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const valA = partsA[i] || 0;
    const valB = partsB[i] || 0;
    if (valA > valB) return 1;
    if (valA < valB) return -1;
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== "android") {
    return null;
  }

  try {
    const response = await fetch(GITHUB_RELEASES_URL);
    if (!response.ok) {
      console.error("Failed to fetch latest release");
      return null;
    }

    const data = await response.json();
    const currentVersion = Application.nativeApplicationVersion || "0.0.0";
    const latestVersion = data.tag_name.replace(/^v/, "");

    if (compareVersions(latestVersion, currentVersion) > 0) {
      const apkAsset = data.assets?.find((asset: any) =>
        asset.name.endsWith(".apk"),
      );
      if (!apkAsset) {
        console.error("No APK asset found in release");
        return null;
      }

      const releaseNotes = data.body || "No release notes available";

      return {
        available: true,
        currentVersion,
        latestVersion,
        releaseNotes,
        apkUrl: apkAsset.browser_download_url,
      };
    }

    return {
      available: false,
      currentVersion,
      latestVersion,
      releaseNotes: "",
      apkUrl: "",
    };
  } catch (error) {
    console.error("Error checking for update:", error);
    return null;
  }
}

export async function downloadApk(
  apkUrl: string,
  onProgress?: (progress: number) => void,
): Promise<string | null> {
  if (Platform.OS !== "android" || !APK_DOWNLOAD_DIR) {
    return null;
  }

  try {
    const apkPath = `${APK_DOWNLOAD_DIR}prysm-update.apk`;

    const downloadResumable = FileSystemLegacy.createDownloadResumable(
      apkUrl,
      apkPath,
      {},
      (downloadProgress) => {
        if (onProgress && downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          onProgress(progress);
        }
      },
    );

    const result = await downloadResumable.downloadAsync();
    return result?.uri || null;
  } catch (error) {
    console.error("Error downloading APK:", error);
    return null;
  }
}

export async function getDownloadedApkPath(): Promise<string | null> {
  if (!APK_DOWNLOAD_DIR) return null;
  const apkPath = `${APK_DOWNLOAD_DIR}prysm-update.apk`;
  const fileInfo = await FileSystemLegacy.getInfoAsync(apkPath);
  return fileInfo.exists ? apkPath : null;
}

export async function clearDownloadedApk(): Promise<void> {
  if (!APK_DOWNLOAD_DIR) return;
  const apkPath = `${APK_DOWNLOAD_DIR}prysm-update.apk`;
  const fileInfo = await FileSystemLegacy.getInfoAsync(apkPath);
  if (fileInfo.exists) {
    await FileSystemLegacy.deleteAsync(apkPath);
  }
}
