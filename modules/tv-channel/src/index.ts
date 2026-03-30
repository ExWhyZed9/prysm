import { requireOptionalNativeModule, Platform } from "expo-modules-core";

export interface FavouriteItem {
  id: string;
  name: string;
  logo?: string;
}

const TvChannelNative =
  Platform.OS === "android"
    ? requireOptionalNativeModule<{
        syncFavourites(items: FavouriteItem[]): Promise<number>;
      }>("TvChannel")
    : null;

/**
 * Publishes (or replaces) the "Prysm Favourites" preview channel on the
 * Android TV launcher with the given list of favourite channels.
 *
 * No-ops on iOS or Android < 8 (API 26).
 */
export async function syncFavourites(items: FavouriteItem[]): Promise<void> {
  if (!TvChannelNative) return;
  await TvChannelNative.syncFavourites(items);
}
