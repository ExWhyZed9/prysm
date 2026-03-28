package expo.modules.tvchannel

import android.net.Uri
import android.os.Build
import androidx.tvprovider.media.tv.PreviewChannel
import androidx.tvprovider.media.tv.PreviewChannelHelper
import androidx.tvprovider.media.tv.PreviewProgram
import androidx.tvprovider.media.tv.TvContractCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TvChannelModule : Module() {
    companion object {
        const val CHANNEL_INTERNAL_ID = "prysm_favourites_channel"
    }

    override fun definition() = ModuleDefinition {
        Name("TvChannel")

        AsyncFunction("syncFavourites") { items: List<Map<String, Any?>>, promise: Promise ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                promise.resolve(null)
                return@AsyncFunction
            }
            val ctx = appContext.reactContext
                ?: return@AsyncFunction promise.reject("NO_CONTEXT", "No context", null)

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val helper = PreviewChannelHelper(ctx)

                    // ── Get or create the preview channel ─────────────────
                    val channelId = getOrCreatePreviewChannel(helper)

                    // ── Replace all preview programs ──────────────────────
                    // Delete existing programs in this channel first.
                    ctx.contentResolver.delete(
                        TvContractCompat.buildPreviewProgramsUriForChannel(channelId),
                        null, null
                    )

                    // Insert new programs for each favourite.
                    for (item in items) {
                        val id   = item["id"]   as? String ?: continue
                        val name = item["name"] as? String ?: continue
                        val logo = item["logo"] as? String

                        val intentUri = Uri.parse("prysmplayer://play?channelId=${Uri.encode(id)}")

                        val builder = PreviewProgram.Builder()
                            .setChannelId(channelId)
                            .setType(TvContractCompat.PreviewPrograms.TYPE_CHANNEL)
                            .setTitle(name)
                            .setIntentUri(intentUri)
                            .setInternalProviderId(id)
                            .setLive(true)
                            .setPosterArtAspectRatio(
                                TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9
                            )

                        if (!logo.isNullOrEmpty()) {
                            builder.setPosterArtUri(Uri.parse(logo))
                        }

                        helper.publishPreviewProgram(builder.build())
                    }

                    withContext(Dispatchers.Main) { promise.resolve(channelId) }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        promise.reject("TV_CHANNEL_ERROR", e.message ?: "Unknown error", e)
                    }
                }
            }
        }
    }

    /**
     * Returns the existing PreviewChannel ID for this app, or creates a new one.
     *
     * Uses [PreviewChannelHelper.publishDefaultChannel] for the first channel —
     * this silently adds the row to the home screen without any user dialog, and
     * registers the app in the "Customize channels" list automatically.
     *
     * For subsequent runs (channel already exists) we just return the stored ID.
     */
    private fun getOrCreatePreviewChannel(helper: PreviewChannelHelper): Long {
        // Check if we already have a channel registered.
        val existing = helper.allChannels.find { it.internalProviderId == CHANNEL_INTERNAL_ID }
        if (existing != null) return existing.id

        // Build the PreviewChannel — NOT Channel. PreviewChannel is the home
        // screen row API. Channel is for TvInputService (live TV tuner) channels.
        val channel = PreviewChannel.Builder()
            .setDisplayName("Prysm Favourites")
            .setDescription("Your starred channels from Prysm")
            .setAppLinkIntentUri(Uri.parse("prysmplayer://favourites"))
            .setInternalProviderId(CHANNEL_INTERNAL_ID)
            .build()

        // publishDefaultChannel silently adds the first channel to the home screen
        // without showing a "Do you want to add this channel?" dialog.
        // This is the same API used by YouTube, Netflix, and the Google TV reference app.
        // It also registers the app in "Customize channels" automatically.
        return helper.publishDefaultChannel(channel)
    }
}
