import { NativeModulesProxy, Platform } from "expo-modules-core";

export interface FavouriteItem {
  id: string;
  name: string;
  logo?: string;
}

const TvChannelNative = NativeModulesProxy.TvChannel;

/**
 * Publishes (or replaces) the "Prysm Favourites" preview channel on the
 * Android TV home screen (picked up by Projectivy and any Android TV launcher).
 * No-ops silently on iOS or Android < 8.0 (API 26).
 */
export async function syncFavourites(items: FavouriteItem[]): Promise<void> {
  if (Platform.OS !== "android" || !TvChannelNative) return;
  try {
    await TvChannelNative.syncFavourites(items);
  } catch (e) {
    // Non-fatal – launcher integration should never crash the app
    console.warn("[TvChannel] syncFavourites failed:", e);
  }
}
