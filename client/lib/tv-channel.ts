import { requireOptionalNativeModule, Platform } from "expo-modules-core";

export interface FavouriteItem {
  id: string;
  name: string;
  logo?: string;
}

/**
 * Lazily resolved reference to the TvChannel native module.
 * `requireOptionalNativeModule` checks `globalThis.expo.modules.TvChannel`
 * (JSI) first, then falls back to NativeModulesProxy and TurboModuleRegistry.
 * Returns `null` when the module isn't available (e.g. on iOS).
 */
const TvChannelNative =
  Platform.OS === "android"
    ? requireOptionalNativeModule<{
        syncFavourites(items: FavouriteItem[]): Promise<number>;
      }>("TvChannel")
    : null;

/**
 * Publishes (or replaces) the "Prysm Favourites" preview channel on the
 * Android TV home screen (picked up by Projectivy and any Android TV launcher).
 * No-ops silently on iOS or Android < 8.0 (API 26).
 */
export async function syncFavourites(items: FavouriteItem[]): Promise<void> {
  if (!TvChannelNative) return;
  try {
    await TvChannelNative.syncFavourites(items);
  } catch (e) {
    // Non-fatal – launcher integration should never crash the app
    console.warn("[TvChannel] syncFavourites failed:", e);
  }
}
