import { NativeModulesProxy, Platform } from "expo-modules-core";

export interface FavouriteItem {
  id: string;
  name: string;
  logo?: string;
}

/**
 * Publishes (or replaces) the "Prysm Favourites" preview channel on the
 * Android TV home screen (picked up by Projectivy and any Android TV launcher).
 * No-ops silently on iOS or Android < 8.0 (API 26).
 *
 * NativeModulesProxy is resolved lazily inside the function so that if the
 * native module hasn't fully registered at module evaluation time (startup
 * race) we still pick it up correctly on the first actual call.
 */
export async function syncFavourites(items: FavouriteItem[]): Promise<void> {
  if (Platform.OS !== "android") return;
  const TvChannelNative = NativeModulesProxy.TvChannel;
  if (!TvChannelNative) return;
  try {
    await TvChannelNative.syncFavourites(items);
  } catch (e) {
    // Non-fatal – launcher integration should never crash the app
    console.warn("[TvChannel] syncFavourites failed:", e);
  }
}
