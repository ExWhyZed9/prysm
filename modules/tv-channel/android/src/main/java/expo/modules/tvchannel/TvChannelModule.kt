package expo.modules.tvchannel

import android.content.ComponentName
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
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
import java.io.File
import java.io.FileOutputStream
import java.net.URL

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

        /** Directory inside cache for downloaded channel logos. */
        private const val LOGO_CACHE_DIR = "channel_logos"
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

                    // Ensure logo cache directory exists
                    val logoDir = File(ctx.cacheDir, LOGO_CACHE_DIR)
                    if (!logoDir.exists()) logoDir.mkdirs()

                    var weight = items.size
                    for (item in items) {
                        val id   = item["id"]   as? String ?: continue
                        val name = item["name"] as? String ?: continue
                        val logo = item["logo"] as? String

                        // Build a launch intent (not just a URI).
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("prysmplayer://play?channelId=${Uri.encode(id)}"))
                            .addCategory(Intent.CATEGORY_BROWSABLE)
                            .addCategory(Intent.CATEGORY_DEFAULT)

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

                        // Download logo and serve via FileProvider so the launcher
                        // (a separate app) can read it. Remote http/https URIs set
                        // directly on posterArtUri often fail because the launcher
                        // blocks cleartext HTTP or can't reach the CDN.
                        val logoUri = downloadAndCacheLogo(ctx, id, logo, logoDir)
                        if (logoUri != null) {
                            builder.setPosterArtUri(logoUri)
                                .setPosterArtAspectRatio(
                                    TvContractCompat.PreviewPrograms.ASPECT_RATIO_1_1
                                )
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
     * Downloads a logo from [url], saves it as a PNG in [cacheDir], and returns
     * a `content://` URI via FileProvider that the launcher can read.
     *
     * Returns `null` if the URL is blank or the download fails.
     * Uses a simple file-name-based cache: if the file already exists and is
     * non-empty, the download is skipped.
     */
    private fun downloadAndCacheLogo(
        ctx: Context,
        channelId: String,
        url: String?,
        cacheDir: File,
    ): Uri? {
        if (url.isNullOrBlank()) return null

        try {
            // Sanitise the channel ID into a safe file name
            val safeId = channelId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
            val file = File(cacheDir, "${safeId}.png")

            // Re-use cached file if it exists and is non-empty
            if (!file.exists() || file.length() == 0L) {
                val connection = URL(url).openConnection().apply {
                    connectTimeout = 5_000
                    readTimeout = 5_000
                }
                connection.getInputStream().use { input ->
                    // Decode to Bitmap to normalise the format (handles JPEG, PNG,
                    // WebP, etc.) then write as PNG so the launcher can read it.
                    val bitmap = BitmapFactory.decodeStream(input) ?: return null
                    FileOutputStream(file).use { out ->
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    }
                    bitmap.recycle()
                }
            }

            if (!file.exists() || file.length() == 0L) return null

            // Generate a content:// URI that other apps can read.
            val authority = "${ctx.packageName}.tvchannel.fileprovider"
            return FileProvider.getUriForFile(ctx, authority, file).also { uri ->
                // Grant the TV launcher read access
                ctx.grantUriPermission(
                    "android.media.tv",
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
        } catch (_: Exception) {
            return null
        }
    }

    /**
     * Finds or creates the "Prysm Favourites" preview channel row.
     */
    private fun getOrCreateChannel(ctx: Context): Long {
        val existing = findChannelByProviderId(ctx, CHANNEL_INTERNAL_ID)
        if (existing != -1L) return existing

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
        writeChannelLogo(ctx, channelId)
        TvContractCompat.requestChannelBrowsable(ctx, channelId)
        return channelId
    }

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
        } finally {
            cursor?.close()
        }
        return -1L
    }

    private fun writeChannelLogo(ctx: Context, channelId: Long) {
        try {
            val iconRes = ctx.applicationInfo.icon
            if (iconRes != 0) {
                val bitmap = BitmapFactory.decodeResource(ctx.resources, iconRes)
                if (bitmap != null) {
                    ChannelLogoUtils.storeChannelLogo(ctx, channelId, bitmap)
                    bitmap.recycle()
                }
            }
        } catch (_: Exception) {}
    }

    private fun createInputId(ctx: Context): String {
        return TvContractCompat.buildInputId(
            ComponentName(ctx, TvChannelModule::class.java)
        )
    }
}
