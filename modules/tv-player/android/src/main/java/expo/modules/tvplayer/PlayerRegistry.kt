package expo.modules.tvplayer

import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer

/**
 * Simple singleton that bridges TvPlayerView → TvPlayerService.
 *
 * TvPlayerView sets [player] before starting TvPlayerService, so the service
 * can build its MediaSession against the already-prepared player instance.
 */
@UnstableApi
object PlayerRegistry {
    @Volatile
    var player: ExoPlayer? = null
}
