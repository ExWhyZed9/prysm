package expo.modules.tvplayer

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.SurfaceTexture
import android.net.Uri
import android.os.Build
import android.view.Gravity
import android.view.Surface
import android.view.SurfaceView
import android.view.TextureView
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaItem.DrmConfiguration
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import okhttp3.OkHttpClient

@UnstableApi
@SuppressLint("ViewConstructor")
class TvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private var exoPlayer: ExoPlayer? = null

    // TV → SurfaceView (avoids TextureView z-order conflict with Leanback compositor).
    // Mobile → TextureView (required when the window is hardware-accelerated but not
    //          in a separate surface layer, which is the normal mobile Activity setup).
    private val isTV: Boolean = context.packageManager
        .hasSystemFeature("android.hardware.type.television") ||
        context.packageManager.hasSystemFeature("android.software.leanback")

    private val surfaceView: SurfaceView? = if (isTV) SurfaceView(context) else null
    private val textureView: TextureView? = if (!isTV) TextureView(context) else null

    private var backgroundAudioEnabled = false

    // ── EventDispatchers (expo-modules-core view callback pattern) ────────────
    val onReady by EventDispatcher()
    val onError by EventDispatcher()
    val onPlayingChange by EventDispatcher()
    val onBufferingChange by EventDispatcher()
    val onBackgroundAudioChange by EventDispatcher()

    init {
        val params = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.CENTER,
        )
        if (isTV) {
            addView(surfaceView, params)
        } else {
            addView(textureView, params)
        }
    }

    // ── Public API called from TvPlayerModule ──────────────────────────────

    fun load(
        url: String,
        headers: Map<String, String>,
        drmType: String?,
        drmLicenseUrl: String?,
        drmHeaders: Map<String, String>?,
        autoPlay: Boolean,
    ) {
        releasePlayer()
        buildPlayer(url, headers, drmType, drmLicenseUrl, drmHeaders, autoPlay)
    }

    fun play() { exoPlayer?.play() }
    fun pause() { exoPlayer?.pause() }
    fun seekTo(positionMs: Long) { exoPlayer?.seekTo(positionMs) }
    fun setVolume(volume: Float) { exoPlayer?.volume = volume }

    fun getCurrentPosition(): Long = exoPlayer?.currentPosition ?: 0L
    fun getDuration(): Long = exoPlayer?.duration?.takeIf { it != C.TIME_UNSET } ?: 0L
    fun isPlaying(): Boolean = exoPlayer?.isPlaying ?: false
    fun isBackgroundAudioEnabled(): Boolean = backgroundAudioEnabled

    /**
     * Start the foreground MediaSessionService so audio keeps playing when the
     * user presses Home.  Safe to call multiple times.
     */
    fun enableBackgroundAudio() {
        if (backgroundAudioEnabled) return
        val player = exoPlayer ?: return

        PlayerRegistry.player = player
        val intent = Intent(context, TvPlayerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        backgroundAudioEnabled = true
        onBackgroundAudioChange(mapOf("enabled" to true))
    }

    /**
     * Stop the foreground service and restore normal (foreground-only) playback.
     */
    fun disableBackgroundAudio(silent: Boolean = false) {
        if (!backgroundAudioEnabled) return
        context.stopService(Intent(context, TvPlayerService::class.java))
        PlayerRegistry.player = null
        backgroundAudioEnabled = false
        if (!silent) {
            try { onBackgroundAudioChange(mapOf("enabled" to false)) } catch (_: Exception) {}
        }
    }

    fun releasePlayer() {
        disableBackgroundAudio(silent = true)
        exoPlayer?.let {
            it.removeListener(playerListener)
            it.release()
        }
        exoPlayer = null
    }

    // ── Internal ──────────────────────────────────────────────────────────

    private fun buildPlayer(
        url: String,
        headers: Map<String, String>,
        drmType: String?,
        drmLicenseUrl: String?,
        drmHeaders: Map<String, String>?,
        autoPlay: Boolean,
    ) {
        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val reqBuilder = chain.request().newBuilder()
                headers.forEach { (k, v) -> reqBuilder.addHeader(k, v) }
                chain.proceed(reqBuilder.build())
            }
            .build()

        val httpDataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
        val dataSourceFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)
        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        val player = ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaSourceFactory)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus= */ true)
            .setHandleAudioBecomingNoisy(true)
            .build()

        // Attach to whichever surface type this device uses
        when {
            isTV && surfaceView != null -> player.setVideoSurfaceView(surfaceView)
            textureView != null        -> attachTextureView(player, textureView)
        }

        player.addListener(playerListener)

        // Build MediaItem, optionally with DRM
        val mediaItemBuilder = MediaItem.Builder().setUri(Uri.parse(url))

        if (!drmType.isNullOrEmpty() && !drmLicenseUrl.isNullOrEmpty()) {
            val drmUuid = when (drmType.lowercase()) {
                "widevine"  -> C.WIDEVINE_UUID
                "playready" -> C.PLAYREADY_UUID
                "clearkey"  -> C.CLEARKEY_UUID
                else         -> null
            }
            if (drmUuid != null) {
                val drmConfigBuilder = DrmConfiguration.Builder(drmUuid)
                    .setLicenseUri(drmLicenseUrl)
                if (!drmHeaders.isNullOrEmpty()) {
                    drmConfigBuilder.setLicenseRequestHeaders(drmHeaders)
                }
                mediaItemBuilder.setDrmConfiguration(drmConfigBuilder.build())
            }
        }

        player.setMediaItem(mediaItemBuilder.build())
        player.prepare()
        if (autoPlay) player.playWhenReady = true

        exoPlayer = player
    }

    /**
     * Wire ExoPlayer to a TextureView.  We wait for the SurfaceTexture to be
     * available (it may already be ready if the view has been through a layout pass).
     */
    private fun attachTextureView(player: ExoPlayer, tv: TextureView) {
        if (tv.isAvailable) {
            player.setVideoSurface(Surface(tv.surfaceTexture))
        }
        tv.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
                player.setVideoSurface(Surface(st))
            }
            override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) {}
            override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
                // Return false so the TextureView keeps the SurfaceTexture alive
                // when the view is briefly detached (e.g. during navigation).
                player.setVideoSurface(null)
                return false
            }
            override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            when (state) {
                Player.STATE_READY     -> {
                    onReady(mapOf<String, Any>())
                    onBufferingChange(mapOf("isBuffering" to false))
                }
                Player.STATE_BUFFERING -> onBufferingChange(mapOf("isBuffering" to true))
                Player.STATE_ENDED     -> {}
                Player.STATE_IDLE      -> {}
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            onPlayingChange(mapOf("isPlaying" to isPlaying))
        }

        override fun onPlayerError(error: PlaybackException) {
            onError(mapOf("message" to (error.message ?: "Unknown playback error")))
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // Do NOT release here — background audio must keep playing.
        // The player is only released when JS explicitly calls release().
    }
}
