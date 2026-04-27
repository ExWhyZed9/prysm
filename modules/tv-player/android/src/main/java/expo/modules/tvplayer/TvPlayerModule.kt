package expo.modules.tvplayer

import androidx.media3.common.util.UnstableApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

@UnstableApi
class TvPlayerModule : Module() {

    private val fetchClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    override fun definition() = ModuleDefinition {
        Name("TvPlayer")

        // ── Native playlist fetcher — uses OkHttp with browser User-Agent
        //   because React Native's fetch strips/overrides the User-Agent header.
        AsyncFunction("fetchPlaylist") { url: String ->
            try {
                val request = Request.Builder()
                    .url(url)
                    .addHeader("User-Agent", BROWSER_UA)
                    .addHeader("Accept", "*/*")
                    .build()
                val response = fetchClient.newCall(request).execute()
                if (!response.isSuccessful) {
                    return@AsyncFunction mapOf(
                        "success" to false,
                        "error" to "HTTP ${response.code}",
                        "content" to ""
                    )
                }
                val content = response.body?.string() ?: ""
                mapOf(
                    "success" to true,
                    "error" to "",
                    "content" to content
                )
            } catch (e: Exception) {
                mapOf(
                    "success" to false,
                    "error" to (e.message ?: "Unknown error"),
                    "content" to ""
                )
            }
        }

        // ── View ────────────────────────────────────────────────────────────
        View(TvPlayerView::class) {

            // ── Events (JS callbacks via EventDispatcher) ──────────────────
            Events(
                "onReady",
                "onError",
                "onPlayingChange",
                "onBufferingChange",
                "onBackgroundAudioChange",
                "onPositionChange",
                "onTracksChange",
                "onPipModeChange",
            )

            // ── Commands (imperative API, auto-added to React ref) ─────────

            AsyncFunction("loadSource") { view: TvPlayerView, params: Map<String, Any?> ->
                val url           = params["url"] as? String ?: return@AsyncFunction
                val headers       = (params["headers"] as? Map<*, *>)
                                        ?.mapNotNull { (k, v) ->
                                            if (k is String && v is String) k to v else null
                                        }?.toMap() ?: emptyMap()
                val drmType       = params["drmType"] as? String
                val drmLicenseUrl = params["drmLicenseUrl"] as? String
                val drmHeaders    = (params["drmHeaders"] as? Map<*, *>)
                                        ?.mapNotNull { (k, v) ->
                                            if (k is String && v is String) k to v else null
                                        }?.toMap()
                val autoPlay      = params["autoPlay"] as? Boolean ?: true

                view.load(url, headers, drmType, drmLicenseUrl, drmHeaders, autoPlay)
            }

            AsyncFunction("play") { view: TvPlayerView ->
                view.play()
            }

            AsyncFunction("pause") { view: TvPlayerView ->
                view.pause()
            }

            AsyncFunction("seekTo") { view: TvPlayerView, positionMs: Double ->
                view.seekTo(positionMs.toLong())
            }

            AsyncFunction("setVolume") { view: TvPlayerView, volume: Double ->
                view.setVolume(volume.toFloat())
            }

            AsyncFunction("release") { view: TvPlayerView ->
                view.releasePlayer()
            }

            AsyncFunction("getCurrentPosition") { view: TvPlayerView ->
                view.getCurrentPosition()
            }

            AsyncFunction("getDuration") { view: TvPlayerView ->
                view.getDuration()
            }

            AsyncFunction("isPlaying") { view: TvPlayerView ->
                view.isPlaying()
            }

            // ── Background audio ───────────────────────────────────────────

            // "contain" → RESIZE_MODE_FIT (0)
            // "cover"   → RESIZE_MODE_ZOOM (3)
            // "fill"    → RESIZE_MODE_FILL (1)
            AsyncFunction("setResizeMode") { view: TvPlayerView, mode: String ->
                val resizeMode = when (mode) {
                    "cover"   -> androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    "fill"    -> androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FILL
                    else      -> androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
                view.setResizeMode(resizeMode)
            }

            AsyncFunction("enableBackgroundAudio") { view: TvPlayerView ->
                view.enableBackgroundAudio()
            }

            AsyncFunction("disableBackgroundAudio") { view: TvPlayerView ->
                view.disableBackgroundAudio()
            }

            AsyncFunction("isBackgroundAudioEnabled") { view: TvPlayerView ->
                view.isBackgroundAudioEnabled()
            }

            // ── Track selection ────────────────────────────────────────────

            AsyncFunction("selectAudioTrack") { view: TvPlayerView, groupIndex: Int, trackIndex: Int ->
                view.selectAudioTrack(groupIndex, trackIndex)
            }

            AsyncFunction("selectSubtitleTrack") { view: TvPlayerView, groupIndex: Int, trackIndex: Int ->
                view.selectSubtitleTrack(groupIndex, trackIndex)
            }

            AsyncFunction("enterPip") { view: TvPlayerView ->
                view.enterPip()
            }

            AsyncFunction("setMediaMetadata") { view: TvPlayerView, params: Map<String, Any?> ->
                val title      = params["title"] as? String ?: ""
                val artist     = params["artist"] as? String ?: "Prysm"
                val artworkUri = params["artworkUri"] as? String
                view.setMediaMetadata(title, artist, artworkUri)
            }
        }
    }
}
