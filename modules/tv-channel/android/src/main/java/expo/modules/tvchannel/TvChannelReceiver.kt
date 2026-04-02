package expo.modules.tvchannel

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.tvprovider.media.tv.Channel
import androidx.tvprovider.media.tv.ChannelLogoUtils
import androidx.tvprovider.media.tv.TvContractCompat

/**
 * Re-registers the "Prysm Favourites" preview channel after device reboot
 * or when the launcher requests apps to re-publish their channels.
 *
 * Listens for:
 *  - BOOT_COMPLETED / QUICKBOOT_POWERON — device reboot
 *  - ACTION_INITIALIZE_PROGRAMS — launcher request (some launchers use this)
 *
 * Programs (tiles) are NOT re-published here because we don't have access
 * to the JS-side favourites list. The row will appear empty after reboot
 * until the user opens the app, at which point PlaylistContext re-populates it.
 */
class TvChannelReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        try {
            // Check if the channel already exists.
            val existing = findChannelByProviderId(context, TvChannelModule.CHANNEL_INTERNAL_ID)
            if (existing != -1L) return // Already registered, nothing to do.

            // Re-create the channel row using the same ContentResolver pattern.
            val builder = Channel.Builder()
                .setDisplayName("Prysm Favourites")
                .setDescription("Your starred channels from Prysm")
                .setType(TvContractCompat.Channels.TYPE_PREVIEW)
                .setInputId(
                    TvContractCompat.buildInputId(
                        ComponentName(context, TvChannelModule::class.java)
                    )
                )
                .setAppLinkIntentUri(Uri.parse("prysmplayer://favourites"))
                .setInternalProviderId(TvChannelModule.CHANNEL_INTERNAL_ID)

            val channelUri = context.contentResolver.insert(
                TvContractCompat.Channels.CONTENT_URI,
                builder.build().toContentValues()
            ) ?: return

            val channelId = ContentUris.parseId(channelUri)

            // Write logo
            val iconRes = context.applicationInfo.icon
            if (iconRes != 0) {
                val bitmap = BitmapFactory.decodeResource(context.resources, iconRes)
                if (bitmap != null) {
                    ChannelLogoUtils.storeChannelLogo(context, channelId, bitmap)
                    bitmap.recycle()
                }
            }

            TvContractCompat.requestChannelBrowsable(context, channelId)
        } catch (_: Exception) {
            // Non-fatal — the channel will be re-created when the app opens
        }
    }

    private fun findChannelByProviderId(context: Context, providerId: String): Long {
        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(
                TvContractCompat.Channels.CONTENT_URI,
                arrayOf(
                    TvContractCompat.Channels._ID,
                    TvContractCompat.Channels.COLUMN_INTERNAL_PROVIDER_ID,
                ),
                null, null, null
            )
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    val channel = Channel.fromCursor(cursor)
                    if (channel.internalProviderId == providerId) {
                        return channel.id
                    }
                }
            }
        } catch (_: Exception) {
        } finally {
            cursor?.close()
        }
        return -1L
    }
}
