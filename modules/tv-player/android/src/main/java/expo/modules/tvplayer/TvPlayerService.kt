package expo.modules.tvplayer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * TvPlayerService — a MediaSessionService that keeps the ExoPlayer MediaSession
 * alive while the app is in the background.
 *
 * Lifecycle:
 *  1. JS calls enableBackgroundAudio() on the view.
 *  2. TvPlayerView starts this service via startForegroundService() and hands
 *     the ExoPlayer instance to PlayerRegistry.
 *  3. onCreate() here picks up that player, builds the MediaSession, and the
 *     Media3 framework automatically posts the playback notification that keeps
 *     the service in the foreground.
 *  4. When JS calls disableBackgroundAudio() the view stops the service; audio
 *     also stops when the player is released.
 *
 * The notification channel is created here (no-op on re-creation) and the
 * Media3 MediaSessionService handles posting the actual notification.
 */
@UnstableApi
class TvPlayerService : MediaSessionService() {

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "tv_player_background"
        const val NOTIFICATION_CHANNEL_NAME = "Background Playback"
    }

    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()

        val player = PlayerRegistry.player ?: return
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo,
    ): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        // User swiped the app away from recents — stop playback and the service.
        // Background audio is intentional so we let it keep playing; the user
        // can stop it via the media notification. Do nothing here.
    }

    override fun onDestroy() {
        mediaSession?.run {
            // Do NOT release the player here — TvPlayerView owns the player
            // lifecycle. Releasing here would kill audio mid-background-play.
            release()
        }
        mediaSession = null
        super.onDestroy()
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    NOTIFICATION_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "Shows playback controls when audio plays in the background"
                    setShowBadge(false)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }
}
