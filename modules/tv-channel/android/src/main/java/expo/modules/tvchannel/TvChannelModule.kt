package expo.modules.tvchannel

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

        // Hardcoded URI used by SmartTube and others for broader device compat.
        private val PREVIEW_PROGRAMS_CONTENT_URI: Uri =
            Uri.parse("content://android.media.tv/preview_program")

        private val CHANNEL_COLUMNS = arrayOf(
            TvContractCompat.Channels._ID,
            TvContractCompat.Channels.COLUMN_DISPLAY_NAME,
            TvContractCompat.Channels.COLUMN_INTERNAL_PROVIDER_ID,
            TvContractCompat.Channels.COLUMN_BROWSABLE,
        )
    }

    override fun definition() = ModuleDefinition {
        Name("TvChannel")

        AsyncFunction("syncFavourites") { items: List<Map<String, Any?>>, promise: Promise ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                promise.resolve(null)
                return@AsyncFunction
            }
            val ctx = appContext.reactContext ?: run {
                promise.resolve(null)
                return@AsyncFunction
            }

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val channelId = getOrCreateChannel(ctx)
                    if (channelId == -1L) {
                        withContext(Dispatchers.Main) { promise.resolve(null) }
                        return@launch
                    }

                    // Delete all existing programs in this channel, then re-insert.
                    ctx.contentResolver.delete(
                        TvContractCompat.buildPreviewProgramsUriForChannel(channelId),
                        null, null
                    )

                    var weight = items.size
                    for (item in items) {
                        val id   = item["id"]   as? String ?: continue
                        val name = item["name"] as? String ?: continue
                        val logo = item["logo"] as? String

                        // Build a launch intent (not just a URI) — this is what
                        // SmartTube and other working implementations use.
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("prysmplayer://play?channelId=${Uri.encode(id)}"))
                            .addCategory(Intent.CATEGORY_BROWSABLE)
                            .addCategory(Intent.CATEGORY_DEFAULT)

                        // Resolve the main activity so the intent is explicit.
                        val mainActivity = ctx.packageManager
                            .getLaunchIntentForPackage(ctx.packageName)
                            ?.component
                        if (mainActivity != null) {
                            intent.setClassName(ctx.packageName, mainActivity.className)
                        }

                        val builder = PreviewProgram.Builder()
                            .setChannelId(channelId)
                            .setType(TvContractCompat.PreviewPrograms.TYPE_CHANNEL)
                            .setTitle(name)
                            .setIntent(intent)
                            .setInternalProviderId(id)
                            .setLive(true)
                            .setWeight(weight--)
                            .setPosterArtAspectRatio(
                                TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9
                            )

                        if (!logo.isNullOrEmpty()) {
                            builder.setPosterArtUri(Uri.parse(logo))
                        }

                        try {
                            ctx.contentResolver.insert(
                                PREVIEW_PROGRAMS_CONTENT_URI,
                                builder.build().toContentValues()
                            )
                        } catch (_: Exception) {
                            // Skip individual program failures
                        }
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
     * Finds or creates the "Prysm Favourites" preview channel row.
     *
     * Uses [Channel.Builder] with [TvContractCompat.Channels.TYPE_PREVIEW]
     * and [ContentResolver] directly — the same pattern SmartTube uses.
     * [PreviewChannelHelper.publishDefaultChannel] silently fails on many
     * launchers; the raw ContentResolver approach is more reliable.
     *
     * After creation, [TvContractCompat.requestChannelBrowsable] is called
     * to make the row visible on the home screen without user interaction.
     */
    private fun getOrCreateChannel(ctx: Context): Long {
        // Search for an existing channel with our internal provider ID.
        val existing = findChannelByProviderId(ctx, CHANNEL_INTERNAL_ID)
        if (existing != -1L) return existing

        // Build channel using Channel (TYPE_PREVIEW), not PreviewChannel.
        val builder = Channel.Builder()
            .setDisplayName("Prysm Favourites")
            .setDescription("Your starred channels from Prysm")
            .setType(TvContractCompat.Channels.TYPE_PREVIEW)
            .setInputId(createInputId(ctx))
            .setAppLinkIntentUri(Uri.parse("prysmplayer://favourites"))
            .setInternalProviderId(CHANNEL_INTERNAL_ID)

        val channelUri = ctx.contentResolver.insert(
            TvContractCompat.Channels.CONTENT_URI,
            builder.build().toContentValues()
        ) ?: return -1L

        val channelId = ContentUris.parseId(channelUri)

        // Write the app icon as the channel logo.
        writeChannelLogo(ctx, channelId)

        // Request browsable status so the channel appears on the home screen
        // without the user having to manually enable it in "Customize channels".
        TvContractCompat.requestChannelBrowsable(ctx, channelId)

        return channelId
    }

    /**
     * Query all channels owned by this app and return the ID of the one
     * matching [providerId], or -1 if not found.
     */
    private fun findChannelByProviderId(ctx: Context, providerId: String): Long {
        var cursor: Cursor? = null
        try {
            cursor = ctx.contentResolver.query(
                TvContractCompat.Channels.CONTENT_URI,
                CHANNEL_COLUMNS, null, null, null
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
            // Content provider may not exist on non-TV devices
        } finally {
            cursor?.close()
        }
        return -1L
    }

    /**
     * Writes the app's launcher icon as the channel logo bitmap.
     * This makes the channel row show the Prysm icon next to the title.
     */
    private fun writeChannelLogo(ctx: Context, channelId: Long) {
        try {
            // Use the app's launcher icon (ic_launcher) as the channel logo.
            val iconRes = ctx.applicationInfo.icon
            if (iconRes != 0) {
                val bitmap = BitmapFactory.decodeResource(ctx.resources, iconRes)
                if (bitmap != null) {
                    ChannelLogoUtils.storeChannelLogo(ctx, channelId, bitmap)
                    bitmap.recycle()
                }
            }
        } catch (_: Exception) {
            // Non-fatal — channel works without a logo
        }
    }

    /**
     * Build an input ID for TvContractCompat. SmartTube uses
     * [TvContractCompat.buildInputId] with a ComponentName pointing
     * to the provider class itself.
     */
    private fun createInputId(ctx: Context): String {
        return TvContractCompat.buildInputId(
            ComponentName(ctx, TvChannelModule::class.java)
        )
    }
}
