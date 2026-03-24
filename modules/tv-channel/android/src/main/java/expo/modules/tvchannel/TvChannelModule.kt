package expo.modules.tvchannel

import android.content.ContentUris
import android.net.Uri
import android.os.Build
import androidx.tvprovider.media.tv.Channel
import androidx.tvprovider.media.tv.PreviewProgram
import androidx.tvprovider.media.tv.TvContractCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class FavouriteItem(
    val id: String,
    val name: String,
    val logo: String?
)

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
                    val channelId = getOrCreateChannel()

                    ctx.contentResolver.delete(
                        TvContractCompat.buildPreviewProgramsUriForChannel(channelId),
                        null, null
                    )

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

                        if (!logo.isNullOrEmpty()) {
                            builder.setPosterArtUri(Uri.parse(logo))
                        }

                        ctx.contentResolver.insert(
                            TvContractCompat.PreviewPrograms.CONTENT_URI,
                            builder.build().toContentValues()
                        )
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

    private fun getOrCreateChannel(): Long {
        val ctx = appContext.reactContext!!

        val cursor = ctx.contentResolver.query(
            TvContractCompat.Channels.CONTENT_URI,
            arrayOf(
                TvContractCompat.Channels._ID,
                TvContractCompat.Channels.COLUMN_INTERNAL_PROVIDER_ID
            ),
            null, null, null
        )

        cursor?.use {
            while (it.moveToNext()) {
                if (it.getString(1) == CHANNEL_INTERNAL_ID) {
                    return it.getLong(0)
                }
            }
        }

        val channel = Channel.Builder()
            .setType(TvContractCompat.Channels.TYPE_PREVIEW)
            .setDisplayName("Prysm Favourites")
            .setDescription("Your starred channels from Prysm Player")
            .setAppLinkIntentUri(Uri.parse("prysmplayer://favourites"))
            .setInternalProviderId(CHANNEL_INTERNAL_ID)
            .build()

        val uri = ctx.contentResolver.insert(
            TvContractCompat.Channels.CONTENT_URI,
            channel.toContentValues()
        ) ?: throw IllegalStateException("Failed to create TV channel")

        val channelId = ContentUris.parseId(uri)
        TvContractCompat.requestChannelBrowsable(ctx, channelId)
        return channelId
    }
}
