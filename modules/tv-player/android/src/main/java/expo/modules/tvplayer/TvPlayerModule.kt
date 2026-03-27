package expo.modules.tvplayer

import androidx.media3.common.util.UnstableApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

@UnstableApi
class TvPlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("TvPlayer")

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
        }
    }
}
