package expo.modules.tvplayer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * TvPlayerService — a Media3 MediaSessionService that keeps playback alive
 * while the app is backgrounded or the screen is off.
 *
 * ## Why the old version stopped after ~5 s
 *
 * Android requires any service started with startForegroundService() to call
 * startForeground() within 5 seconds or the system raises a
 * ForegroundServiceDidNotStartInTimeException and kills the process.
 *
 * Media3's MediaSessionService calls startForeground() internally only after
 * onGetSession() returns a non-null session AND its DefaultMediaNotificationProvider
 * successfully posts the first notification. If PlayerRegistry.player is null
 * when onCreate() runs (race condition), onGetSession() returns null → no
 * notification is ever posted → Android kills the service at the 5-second mark.
 *
 * ## Fix
 *
 * 1. Call startForeground() ourselves in onCreate() with a minimal placeholder
 *    notification. This satisfies Android's 5-second requirement immediately,
 *    regardless of whether the player is ready.
 * 2. Once the MediaSession is built (player is available), Media3 replaces the
 *    placeholder with its own rich playback notification automatically.
 * 3. If the player is not yet in PlayerRegistry when onCreate() fires (unlikely
 *    but possible), we retry once the service receives its first command.
 */
@UnstableApi
class TvPlayerService : MediaSessionService() {

    companion object {
        const val NOTIFICATION_CHANNEL_ID   = "tv_player_background"
        const val NOTIFICATION_CHANNEL_NAME = "Background Playback"
        // Stable notification ID — must be > 0 and consistent across calls
        const val FOREGROUND_NOTIFICATION_ID = 1001
    }

    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()

        // ── Step 1: Call startForeground() immediately ────────────────────────
        // This keeps Android from killing the service within the 5-second window
        // while we wait for Media3 to post its rich playback notification.
        startForeground(FOREGROUND_NOTIFICATION_ID, buildPlaceholderNotification())

        // ── Step 2: Build the MediaSession if the player is already registered ─
        tryBuildSession()
    }

    /**
     * Called by Media3 framework when a controller connects (e.g. the system
     * media UI, Bluetooth controls, Now Playing on Android TV).
     */
    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo,
    ): MediaSession? {
        // If the session wasn't built in onCreate (race condition), try now.
        if (mediaSession == null) tryBuildSession()
        return mediaSession
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // User swiped the app from recents. Background audio is intentional —
        // leave the service running. The user can stop audio via the
        // media notification stop button or via the in-app dialog on TV.
        // Do nothing here.
    }

    override fun onDestroy() {
        mediaSession?.run {
            // Do NOT release the player here — TvPlayerView still owns the
            // player lifecycle and will release it when appropriate.
            release()
        }
        mediaSession = null
        super.onDestroy()
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun tryBuildSession() {
        val player = PlayerRegistry.player ?: return
        if (mediaSession != null) return // already built

        mediaSession = MediaSession.Builder(this, player)
            .setCallback(object : MediaSession.Callback {
                // Allow system and Bluetooth controllers to connect
                override fun onConnect(
                    session: MediaSession,
                    controller: MediaSession.ControllerInfo,
                ): MediaSession.ConnectionResult =
                    MediaSession.ConnectionResult.AcceptedResultBuilder(session).build()
            })
            .build()
    }

    /**
     * A minimal placeholder notification posted immediately in onCreate() so
     * Android's 5-second foreground service deadline is never breached.
     * Media3 replaces this with its rich playback notification as soon as
     * the MediaSession is built and the player starts playing.
     */
    private fun buildPlaceholderNotification(): Notification {
        // Tapping the notification opens the app
        val launchIntent = packageManager
            .getLaunchIntentForPackage(packageName)
            ?.apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP }
        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        else PendingIntent.FLAG_UPDATE_CURRENT
        val contentIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingFlags)

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Prysm")
            .setContentText("Playing in background…")
            .setContentIntent(contentIntent)
            .setSilent(true)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
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
