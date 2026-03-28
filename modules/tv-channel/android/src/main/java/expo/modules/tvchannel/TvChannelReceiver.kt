package expo.modules.tvchannel

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.tvprovider.media.tv.PreviewChannelHelper
import androidx.tvprovider.media.tv.TvContractCompat

/**
 * Receives ACTION_INITIALIZE_PROGRAMS when the Android TV launcher requests the
 * app to re-publish its preview channels (typically after a device reboot or a
 * factory reset). Without this, the home screen row disappears on every reboot.
 *
 * The launcher sends this broadcast to all apps that have previously registered
 * a preview channel. Re-registering the channel here ensures the row stays
 * visible in "Customize channels" and on the home screen persistently.
 *
 * Note: programs (tiles) are NOT re-published here because we don't have access
 * to the JS-side favourites list in a BroadcastReceiver. The row will appear
 * empty after reboot until the user opens the app, at which point the startup
 * sync in PlaylistContext re-populates it.
 */
class TvChannelReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TvContractCompat.ACTION_INITIALIZE_PROGRAMS) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        try {
            val helper = PreviewChannelHelper(context)
            // Re-register the channel if it was wiped. publishDefaultChannel is
            // idempotent when called with the same internalProviderId — it won't
            // create duplicates.
            val existing = helper.allChannels.find {
                it.internalProviderId == TvChannelModule.CHANNEL_INTERNAL_ID
            }
            if (existing == null) {
                val channel = androidx.tvprovider.media.tv.PreviewChannel.Builder()
                    .setDisplayName("Prysm Favourites")
                    .setDescription("Your starred channels from Prysm")
                    .setAppLinkIntentUri(android.net.Uri.parse("prysmplayer://favourites"))
                    .setInternalProviderId(TvChannelModule.CHANNEL_INTERNAL_ID)
                    .build()
                helper.publishDefaultChannel(channel)
            }
        } catch (e: Exception) {
            // Non-fatal — the channel will be re-created when the app opens next
        }
    }
}
