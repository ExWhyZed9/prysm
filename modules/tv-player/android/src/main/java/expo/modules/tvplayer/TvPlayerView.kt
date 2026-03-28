package expo.modules.tvplayer

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.SurfaceTexture
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Rational
import android.view.Gravity
import android.view.Surface
import android.view.SurfaceView
import android.view.TextureView
import android.view.ViewGroup
import android.widget.FrameLayout
import com.prysmplayer.app.MainActivity
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaItem.DrmConfiguration
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import okhttp3.OkHttpClient

@UnstableApi
@SuppressLint("ViewConstructor")
class TvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private var exoPlayer: ExoPlayer? = null

    private val isTV: Boolean = context.packageManager
        .hasSystemFeature("android.hardware.type.television") ||
        context.packageManager.hasSystemFeature("android.software.leanback")

    // AspectRatioFrameLayout is the Media3-UI container that resizes itself to
    // match the video's actual aspect ratio — prevents the stretch-to-fill
    // that happens when a bare SurfaceView/TextureView fills its parent.
    private val aspectFrame = AspectRatioFrameLayout(context).apply {
        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT   // "contain" — default
        layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.CENTER,
        )
    }

    private val surfaceView: SurfaceView? = if (isTV) SurfaceView(context) else null
    private val textureView: TextureView? = if (!isTV) TextureView(context) else null

    // Background audio state
    private var backgroundAudioEnabled = false
    // Guard against re-entrant start/stop calls while the service is mid-transition
    private var serviceStarting = false

    private val mainHandler = Handler(Looper.getMainLooper())
    private val positionPoller = object : Runnable {
        override fun run() {
            val p = exoPlayer ?: return
            onPositionChange(mapOf(
                "position" to p.currentPosition,
                "duration" to (p.duration.takeIf { it != C.TIME_UNSET } ?: 0L),
            ))
            mainHandler.postDelayed(this, 1000)
        }
    }

    // ── EventDispatchers ──────────────────────────────────────────────────────
    val onReady by EventDispatcher()
    val onError by EventDispatcher()
    val onPlayingChange by EventDispatcher()
    val onBufferingChange by EventDispatcher()
    val onBackgroundAudioChange by EventDispatcher()
    val onPositionChange by EventDispatcher()
    /** Fired when the available audio/subtitle tracks change (e.g. after load). */
    val onTracksChange by EventDispatcher()
    /** Fired when the app enters or exits Picture-in-Picture mode. */
    val onPipModeChange by EventDispatcher()

    init {
        val fillParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        if (isTV) {
            aspectFrame.addView(surfaceView, fillParams)
        } else {
            aspectFrame.addView(textureView, fillParams)
        }
        addView(aspectFrame)
    }

    // ── Resize mode (called from JS contentFit prop if we add it later) ───────
    fun setResizeMode(mode: Int) {
        aspectFrame.resizeMode = mode
        // Force a layout pass so AspectRatioFrameLayout applies the new mode
        // immediately — without this the visual size doesn't update until the
        // next unrelated layout event.
        aspectFrame.requestLayout()
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

    /**
     * Enter Picture-in-Picture mode (mobile only — no-op on TV).
     * Delegates to MainActivity.enterPipMode() which builds the
     * PictureInPictureParams with the current video aspect ratio.
     */
    fun enterPip() {
        if (isTV) return
        val activity = appContext.currentActivity as? MainActivity ?: return
        activity.enterPipMode()
    }

    fun getCurrentPosition(): Long = exoPlayer?.currentPosition ?: 0L
    fun getDuration(): Long = exoPlayer?.duration?.takeIf { it != C.TIME_UNSET } ?: 0L
    fun isPlaying(): Boolean = exoPlayer?.isPlaying ?: false
    fun isBackgroundAudioEnabled(): Boolean = backgroundAudioEnabled

    /**
     * Select an audio track by its group + track index within the current tracks.
     * [groupIndex] and [trackIndex] correspond to the values sent in onTracksChange.
     */
    fun selectAudioTrack(groupIndex: Int, trackIndex: Int) {
        val player = exoPlayer ?: return
        val tracks = player.currentTracks
        val groups = tracks.groups.filter { it.type == androidx.media3.common.C.TRACK_TYPE_AUDIO }
        val group = groups.getOrNull(groupIndex) ?: return
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setOverrideForType(
                androidx.media3.common.TrackSelectionOverride(group.mediaTrackGroup, trackIndex)
            )
            .build()
    }

    /**
     * Select a text/subtitle track by its group + track index.
     * Pass groupIndex = -1 to disable all subtitles.
     */
    fun selectSubtitleTrack(groupIndex: Int, trackIndex: Int) {
        val player = exoPlayer ?: return
        val params = player.trackSelectionParameters.buildUpon()
        if (groupIndex < 0) {
            // Disable all text tracks
            params.setIgnoredTextSelectionFlags(androidx.media3.common.C.SELECTION_FLAG_DEFAULT)
            params.setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, true)
        } else {
            val tracks = player.currentTracks
            val groups = tracks.groups.filter { it.type == androidx.media3.common.C.TRACK_TYPE_TEXT }
            val group = groups.getOrNull(groupIndex) ?: return
            params.setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, false)
            params.setOverrideForType(
                androidx.media3.common.TrackSelectionOverride(group.mediaTrackGroup, trackIndex)
            )
        }
        player.trackSelectionParameters = params.build()
    }

    /**
     * Enable background audio.
     *
     * Sets PlayerRegistry.player BEFORE starting the service so that
     * TvPlayerService.onCreate() always finds a valid player.
     * Uses a serviceStarting guard to prevent double-starts.
     */
    fun enableBackgroundAudio() {
        if (backgroundAudioEnabled || serviceStarting) return
        val player = exoPlayer ?: return

        serviceStarting = true
        PlayerRegistry.player = player

        val intent = Intent(context, TvPlayerService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            backgroundAudioEnabled = true
            onBackgroundAudioChange(mapOf("enabled" to true))
        } catch (e: Exception) {
            // startForegroundService can throw on some OEM ROMs — reset state cleanly
            PlayerRegistry.player = null
        } finally {
            serviceStarting = false
        }
    }

    /**
     * Disable background audio.
     *
     * Clears PlayerRegistry BEFORE stopping the service so the service's
     * onDestroy() cannot accidentally access a stale player reference.
     * The `silent` flag suppresses the JS event (used during releasePlayer).
     */
    fun disableBackgroundAudio(silent: Boolean = false) {
        if (!backgroundAudioEnabled) return
        backgroundAudioEnabled = false
        PlayerRegistry.player = null
        try {
            context.stopService(Intent(context, TvPlayerService::class.java))
        } catch (_: Exception) {}
        if (!silent) {
            try { onBackgroundAudioChange(mapOf("enabled" to false)) } catch (_: Exception) {}
        }
    }

    fun releasePlayer() {
        PipRegistry.isPlayerActive = false
        stopPoller()
        disableBackgroundAudio(silent = true)
        exoPlayer?.let {
            it.removeListener(aspectRatioListener)
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
            context, OkHttpDataSource.Factory(okHttpClient),
        )

        // AUDIO_CONTENT_TYPE_MUSIC covers both live TV and radio streams.
        // AUDIO_CONTENT_TYPE_MOVIE caused audio focus issues on audio-only
        // streams (radio) on Android 12+ because no video renderer was active.
        val audioAttrs = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        // DefaultRenderersFactory with EXTENSION_RENDERER_MODE_PREFER enables
        // software decoders for AC3/EAC3/Dolby (common in DVB-T broadcasts from
        // TV tuner backends like NextPVR) when the device has no hardware decoder.
        val renderersFactory = DefaultRenderersFactory(context)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)

        // DefaultTrackSelector with allowAudioMixedMimeTypeAdaptiveness ensures
        // ExoPlayer always selects an audio track even when the stream contains
        // codec types the default heuristic would normally skip (e.g. AC3 on a
        // device that reports no hardware AC3 decoder).
        val trackSelector = DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setAllowAudioMixedMimeTypeAdaptiveness(true)
                    .setAllowAudioMixedChannelCountAdaptiveness(true)
                    .setAllowAudioMixedDecoderSupportAdaptiveness(true)
                    .build()
            )
        }

        val player = ExoPlayer.Builder(context)
            .setRenderersFactory(renderersFactory)
            .setTrackSelector(trackSelector)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .setAudioAttributes(audioAttrs, /* handleAudioFocus= */ true)
            .setHandleAudioBecomingNoisy(true)
            .build()

        // Attach video output surface
        when {
            isTV && surfaceView != null -> player.setVideoSurfaceView(surfaceView)
            textureView != null -> attachTextureView(player, textureView)
        }

        // aspectRatioListener and playerListener are named fields — they are removed
        // cleanly in releasePlayer(), preventing leaks across load() calls.
        player.addListener(aspectRatioListener)
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
        if (!isTV) PipRegistry.isPlayerActive = true
    }

    private fun attachTextureView(player: ExoPlayer, tv: TextureView) {
        // aspectRatioListener is added by buildPlayer() — no duplicate needed here.
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

    // Reusable aspect-ratio listener — added once, removed in releasePlayer()
    private val aspectRatioListener = object : Player.Listener {
        override fun onVideoSizeChanged(videoSize: androidx.media3.common.VideoSize) {
            if (videoSize.width > 0 && videoSize.height > 0) {
                val ratio = videoSize.width.toFloat() /
                        (videoSize.height * videoSize.pixelWidthHeightRatio)
                aspectFrame.setAspectRatio(ratio)
                // Keep PiP aspect ratio in sync with the actual video dimensions
                if (!isTV) {
                    PipRegistry.aspectRatio = Rational(videoSize.width, videoSize.height)
                }
            }
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

        override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
            // Build audio track list
            val audioTracks = mutableListOf<Map<String, Any>>()
            val subtitleTracks = mutableListOf<Map<String, Any>>()

            tracks.groups.forEachIndexed { groupIdx, group ->
                when (group.type) {
                    androidx.media3.common.C.TRACK_TYPE_AUDIO -> {
                        for (trackIdx in 0 until group.length) {
                            val format = group.getTrackFormat(trackIdx)
                            audioTracks.add(mapOf(
                                "groupIndex" to groupIdx,
                                "trackIndex" to trackIdx,
                                "id" to "audio_${groupIdx}_${trackIdx}",
                                "label" to (format.label ?: format.language ?: "Track ${audioTracks.size + 1}"),
                                "language" to (format.language ?: ""),
                                "isSelected" to group.isTrackSelected(trackIdx),
                            ))
                        }
                    }
                    androidx.media3.common.C.TRACK_TYPE_TEXT -> {
                        for (trackIdx in 0 until group.length) {
                            val format = group.getTrackFormat(trackIdx)
                            subtitleTracks.add(mapOf(
                                "groupIndex" to groupIdx,
                                "trackIndex" to trackIdx,
                                "id" to "sub_${groupIdx}_${trackIdx}",
                                "label" to (format.label ?: format.language ?: "Subtitle ${subtitleTracks.size + 1}"),
                                "language" to (format.language ?: ""),
                                "isSelected" to group.isTrackSelected(trackIdx),
                            ))
                        }
                    }
                    else -> {}
                }
            }

            onTracksChange(mapOf(
                "audioTracks" to audioTracks,
                "subtitleTracks" to subtitleTracks,
            ))
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        if (backgroundAudioEnabled) {
            // Background audio is active — keep the player alive but detach the
            // video surface so the player doesn't attempt to render to a destroyed
            // Surface, which causes crashes on some devices.
            stopPoller()
            exoPlayer?.setVideoSurface(null)
            exoPlayer?.setVideoSurfaceView(null)
        } else {
            // No background audio — release everything to avoid memory/battery leaks.
            releasePlayer()
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // Re-attach the video surface when the view comes back to the foreground
        // (e.g. user returns from launcher while background audio is playing).
        if (backgroundAudioEnabled) {
            val player = exoPlayer ?: return
            when {
                isTV && surfaceView != null -> player.setVideoSurfaceView(surfaceView)
                textureView != null -> attachTextureView(player, textureView)
            }
            startPoller()
        }
    }
}
