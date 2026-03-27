package expo.modules.tvplayer

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.SurfaceTexture
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
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
    // Mobile → TextureView (required in a normal hardware-accelerated Activity window).
    private val isTV: Boolean = context.packageManager
        .hasSystemFeature("android.hardware.type.television") ||
        context.packageManager.hasSystemFeature("android.software.leanback")

    private val surfaceView: SurfaceView? = if (isTV) SurfaceView(context) else null
    private val textureView: TextureView? = if (!isTV) TextureView(context) else null

    private var backgroundAudioEnabled = false

    // Polls position/duration every second while playing
    private val mainHandler = Handler(Looper.getMainLooper())
    private val positionPoller = object : Runnable {
        override fun run() {
            val p = exoPlayer ?: return
            val pos = p.currentPosition
            val dur = p.duration.takeIf { it != C.TIME_UNSET } ?: 0L
            onPositionChange(mapOf("position" to pos, "duration" to dur))
            mainHandler.postDelayed(this, 1000)
        }
    }

    // ── EventDispatchers ─────────────────────────────────────────────────────
    val onReady by EventDispatcher()
    val onError by EventDispatcher()
    val onPlayingChange by EventDispatcher()
    val onBufferingChange by EventDispatcher()
    val onBackgroundAudioChange by EventDispatcher()
    val onPositionChange by EventDispatcher()

    init {
        val params = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.CENTER,
        )
        if (isTV) addView(surfaceView, params) else addView(textureView, params)
    }

    // ── Public API ────────────────────────────────────────────────────────────

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
        stopPoller()
        disableBackgroundAudio(silent = true)
        exoPlayer?.let {
            it.removeListener(playerListener)
            it.release()
        }
        exoPlayer = null
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun startPoller() {
        mainHandler.removeCallbacks(positionPoller)
        mainHandler.post(positionPoller)
    }

    private fun stopPoller() {
        mainHandler.removeCallbacks(positionPoller)
    }

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
                val req = chain.request().newBuilder()
                headers.forEach { (k, v) -> req.addHeader(k, v) }
                chain.proceed(req.build())
            }
            .build()

        val dataSourceFactory = DefaultDataSource.Factory(
            context, OkHttpDataSource.Factory(okHttpClient)
        )

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        val player = ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .build()

        when {
            isTV && surfaceView != null -> player.setVideoSurfaceView(surfaceView)
            textureView != null        -> attachTextureView(player, textureView)
        }

        player.addListener(playerListener)

        val mediaItemBuilder = MediaItem.Builder().setUri(Uri.parse(url))
        if (!drmType.isNullOrEmpty() && !drmLicenseUrl.isNullOrEmpty()) {
            val uuid = when (drmType.lowercase()) {
                "widevine"  -> C.WIDEVINE_UUID
                "playready" -> C.PLAYREADY_UUID
                "clearkey"  -> C.CLEARKEY_UUID
                else        -> null
            }
            if (uuid != null) {
                val drmCfg = DrmConfiguration.Builder(uuid).setLicenseUri(drmLicenseUrl)
                if (!drmHeaders.isNullOrEmpty()) drmCfg.setLicenseRequestHeaders(drmHeaders)
                mediaItemBuilder.setDrmConfiguration(drmCfg.build())
            }
        }

        player.setMediaItem(mediaItemBuilder.build())
        player.prepare()
        if (autoPlay) player.playWhenReady = true

        exoPlayer = player
    }

    private fun attachTextureView(player: ExoPlayer, tv: TextureView) {
        if (tv.isAvailable) player.setVideoSurface(Surface(tv.surfaceTexture))
        tv.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
                player.setVideoSurface(Surface(st))
            }
            override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) {}
            override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
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
                    startPoller()
                }
                Player.STATE_BUFFERING -> {
                    onBufferingChange(mapOf("isBuffering" to true))
                    stopPoller()
                }
                Player.STATE_ENDED,
                Player.STATE_IDLE      -> stopPoller()
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            onPlayingChange(mapOf("isPlaying" to isPlaying))
            if (isPlaying) startPoller() else stopPoller()
        }

        override fun onPlayerError(error: PlaybackException) {
            stopPoller()
            onError(mapOf("message" to (error.message ?: "Unknown playback error")))
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // Do NOT release — background audio keeps playing.
        // Poller is stopped here; it restarts when playing resumes.
        stopPoller()
    }
}
