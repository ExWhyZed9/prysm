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
import android.widget.LinearLayout
import android.app.PictureInPictureParams
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaItem.DrmConfiguration
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.SubtitleView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import okhttp3.OkHttpClient

@UnstableApi
@SuppressLint("ViewConstructor")
class TvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    // ExpoView extends LinearLayout. React Native suppresses requestLayout() by
    // default (RN issue #17968), which prevents AspectRatioFrameLayout from
    // re-measuring when the video aspect ratio or resize mode changes. Enabling
    // shouldUseAndroidLayout forces measure+layout passes through.
    override val shouldUseAndroidLayout: Boolean = true

    private var exoPlayer: ExoPlayer? = null

    private val isTV: Boolean = context.packageManager
        .hasSystemFeature("android.hardware.type.television") ||
        context.packageManager.hasSystemFeature("android.software.leanback")

    // AspectRatioFrameLayout resizes itself inside onMeasure to match the video
    // aspect ratio. It needs MATCH_PARENT so it receives the full available
    // size from its parent (TvPlayerView) to adjust from.
    // RESIZE_MODE_FIT = contain (letterbox), RESIZE_MODE_ZOOM = cover (crop),
    // RESIZE_MODE_FILL = stretch to fill.
    // Default aspect ratio 16:9 is set immediately so the view letterboxes
    // even before onVideoSizeChanged fires — without this, videoAspectRatio
    // stays 0 and onMeasure returns early, leaving the TextureView stretched.
    private val aspectFrame = AspectRatioFrameLayout(context).apply {
        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        setAspectRatio(16f / 9f)
    }

    private val surfaceView: SurfaceView? = if (isTV) SurfaceView(context) else null
    private val textureView: TextureView? = if (!isTV) TextureView(context) else null
    private val subtitleView = SubtitleView(context)

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
        // ExpoView is a LinearLayout — set gravity so AspectRatioFrameLayout
        // (which measures itself smaller in FIT mode) is centred on both axes.
        gravity = Gravity.CENTER
        orientation = VERTICAL

        // Children of AspectRatioFrameLayout (a FrameLayout) use FrameLayout.LayoutParams.
        val fillParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        if (isTV) {
            aspectFrame.addView(surfaceView, fillParams)
        } else {
            aspectFrame.addView(textureView, fillParams)
        }

        // SubtitleView overlays on top of the video surface inside the
        // AspectRatioFrameLayout so it scales with the video aspect ratio.
        subtitleView.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION)
        aspectFrame.addView(subtitleView, fillParams)

        // Use LinearLayout.LayoutParams for the aspect frame since *this* view
        // is a LinearLayout (via ExpoView). FrameLayout.LayoutParams gravity is
        // silently dropped during the LinearLayout param conversion.
        addView(aspectFrame, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            1f, // weight — takes all available space in the vertical LinearLayout
        ))

        // Register for PiP mode changes from MainActivity via PipRegistry.
        // This fires the native view event which reaches JS reliably even
        // with New Architecture (bridgeless), unlike DeviceEventEmitter.
        if (!isTV) {
            PipRegistry.onPipModeChanged = { isInPip ->
                PipRegistry.isInPipMode = isInPip
                if (isInPip) {
                    // Switch to cover mode synchronously so the layout is already
                    // correct when the window shrinks. Then force a layout pass.
                    aspectFrame.resizeMode =
                        AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    aspectFrame.requestLayout()
                    requestLayout()
                } else {
                    // Exiting PiP — re-attach video surface if it was detached
                    val player = exoPlayer
                    if (player != null && !backgroundAudioEnabled) {
                        when {
                            surfaceView != null -> player.setVideoSurfaceView(surfaceView)
                            textureView != null -> attachTextureView(player, textureView)
                        }
                        mainHandler.post {
                            player.playWhenReady = true
                        }
                    }
                }
                mainHandler.post {
                    onPipModeChange(mapOf("isInPiP" to isInPip))
                }
            }
        }
    }

    // ── Resize mode (called from JS via setResizeMode command) ──────────────
    fun setResizeMode(mode: Int) {
        aspectFrame.resizeMode = mode
        // Force a full measure+layout pass so the new mode takes effect
        // immediately. requestLayout alone is swallowed by React Native unless
        // shouldUseAndroidLayout is true.
        aspectFrame.requestLayout()
        requestLayout()
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
     * Builds PictureInPictureParams using the current video aspect ratio
     * from PipRegistry and enters PiP directly via the current Activity.
     */
    fun enterPip() {
        if (isTV) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val activity = appContext.currentActivity ?: return

        // Switch to cover mode immediately so the aspect frame is already
        // in the correct state before the window shrinks.
        aspectFrame.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        aspectFrame.requestLayout()
        requestLayout()

        try {
            val ratio = PipRegistry.aspectRatio
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(ratio.numerator, ratio.denominator))
                .apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        setAutoEnterEnabled(false)
                        setSeamlessResizeEnabled(true)
                    }
                }
                .build()
            activity.enterPictureInPictureMode(params)
        } catch (_: Exception) {}
    }

    fun getCurrentPosition(): Long = exoPlayer?.currentPosition ?: 0L
    fun getDuration(): Long = exoPlayer?.duration?.takeIf { it != C.TIME_UNSET } ?: 0L
    fun isPlaying(): Boolean = exoPlayer?.isPlaying ?: false
    fun isBackgroundAudioEnabled(): Boolean = backgroundAudioEnabled

    /**
     * Updates the media metadata (title, artist, artwork) used by the system
     * media notification and Now Playing controls.
     */
    fun setMediaMetadata(title: String, artist: String, artworkUri: String?) {
        val player = exoPlayer ?: return
        val metadata = androidx.media3.common.MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .apply {
                if (!artworkUri.isNullOrBlank()) {
                    setArtworkUri(android.net.Uri.parse(artworkUri))
                }
            }
            .build()

        val currentItem = player.currentMediaItem
        if (currentItem != null) {
            val newItem = currentItem.buildUpon()
                .setMediaMetadata(metadata)
                .build()
            player.setMediaItem(newItem)
        }
    }

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
        exoPlayer?.let { player ->
            // Remove listeners FIRST to prevent any pending callbacks from firing
            // after we begin release. This avoids "Handler on dead thread" errors
            // during rapid channel switching.
            player.removeListener(aspectRatioListener)
            player.removeListener(playerListener)
            player.removeListener(subtitleListener)
            // Clear the video surface before release to ensure MediaCodec
            // releases its resources and stops async callbacks.
            player.setVideoSurface(null)
            player.setVideoSurfaceView(null)
            // Stop the player before releasing to ensure MediaCodec handlers
            // are shut down cleanly and don't send messages to dead threads.
            player.stop()
            player.release()
        }
        exoPlayer = null
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * Infer MIME type from URL to help ExoPlayer pick the correct extractor.
     * NextPVR and other TV backends often serve MPEG-TS without proper
     * Content-Type headers, causing ExoPlayer's auto-detection to fail with
     * UnrecognizedInputFormatException.
     */
    private fun getStreamMimeType(url: String): String? {
        val lower = url.lowercase().split("?")[0]
        return when {
            lower.endsWith(".m3u8") || lower.endsWith(".m3u") -> "application/x-mpegURL"
            lower.endsWith(".ts") -> "video/mp2t"
            lower.endsWith(".mpd") -> "application/dash+xml"
            lower.endsWith(".mp4") || lower.endsWith(".m4s") -> "video/mp4"
            lower.endsWith(".aac") -> "audio/aac"
            lower.endsWith(".mp3") -> "audio/mpeg"
            lower.contains("/service?method=channel.stream") ||
            lower.contains("/live/") ||
            lower.contains("/stream/") -> "video/mp2t"
            else -> null
        }
    }

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
                    .addHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
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
                    .setAllowVideoMixedMimeTypeAdaptiveness(true)
                    .build()
            )
        }

        val player = ExoPlayer.Builder(context)
            .setRenderersFactory(renderersFactory)
            .setTrackSelector(trackSelector)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .setAudioAttributes(audioAttrs, /* handleAudioFocus= */ false)
            .setHandleAudioBecomingNoisy(true)
            .build()

        // Attach video output surface
        when {
            isTV && surfaceView != null -> player.setVideoSurfaceView(surfaceView)
            textureView != null -> attachTextureView(player, textureView)
        }

        // aspectRatioListener, playerListener, and subtitleListener are named
        // fields — they are removed cleanly in releasePlayer(), preventing
        // leaks across load() calls.
        player.addListener(aspectRatioListener)
        player.addListener(playerListener)
        player.addListener(subtitleListener)

        val mediaItemBuilder = MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMimeType(getStreamMimeType(url))
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
                // Display width accounts for pixel aspect ratio (PAR) — multiply
                // width by pixelWidthHeightRatio to get the actual display width.
                // E.g., 720x576 with PAR 1.422 (PAL) displays as 1024x576.
                val ratio = (videoSize.width * videoSize.pixelWidthHeightRatio).toFloat() /
                        videoSize.height
                aspectFrame.setAspectRatio(ratio)
                // Force re-layout so the new aspect ratio is applied immediately
                requestLayout()
                // Keep PiP aspect ratio in sync with the actual video dimensions
                if (!isTV) {
                    PipRegistry.aspectRatio = Rational(videoSize.width, videoSize.height)
                }
            }
        }
    }

    private val subtitleListener = object : Player.Listener {
        override fun onCues(cueGroup: CueGroup) {
            subtitleView.setCues(cueGroup.cues)
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
                    // Don't stop poller during buffering — position may still update
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
        // Unregister the PiP callback to avoid leaking this view.
        if (!isTV) PipRegistry.onPipModeChanged = null
        if (backgroundAudioEnabled) {
            // Background audio is active — keep the player alive but detach the
            // video surface so the player doesn't attempt to render to a destroyed
            // Surface, which causes crashes on some devices.
            stopPoller()
            exoPlayer?.setVideoSurface(null)
            exoPlayer?.setVideoSurfaceView(null)
            exoPlayer?.removeListener(subtitleListener)
        } else if (PipRegistry.isInPipMode) {
            // App is going to background via PiP — keep the player alive so
            // video continues in the PiP window. Detach surface only if the
            // view is truly being destroyed (not just hidden for PiP).
            exoPlayer?.setVideoSurface(null)
            exoPlayer?.setVideoSurfaceView(null)
        } else if (isTV) {
            // TV: keep the player alive when minimizing (background audio mode)
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
        // (e.g. user returns from launcher while background audio is playing,
        // or exits PiP mode on mobile).
        val player = exoPlayer ?: return
        if (backgroundAudioEnabled || PipRegistry.isInPipMode) {
            when {
                isTV && surfaceView != null -> player.setVideoSurfaceView(surfaceView)
                textureView != null -> attachTextureView(player, textureView)
            }
            startPoller()
        }
    }
}
