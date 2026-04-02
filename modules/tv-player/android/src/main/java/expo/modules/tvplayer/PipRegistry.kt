package expo.modules.tvplayer

import android.util.Rational

/**
 * Bridges TvPlayerView ↔ MainActivity for PiP.
 *
 * TvPlayerView sets [isPlayerActive] = true when a source is loaded and playing,
 * false when released. MainActivity reads this in onUserLeaveHint() to decide
 * whether to auto-enter PiP.
 *
 * [isInPipMode] is set by MainActivity.onPictureInPictureModeChanged() so that
 * TvPlayerView can force a re-layout when the window shrinks/grows.
 */
object PipRegistry {
    /** True when a player is active and PiP should be triggered on Home press. */
    @Volatile var isPlayerActive: Boolean = false

    /** Aspect ratio for the PiP window — updated when video size changes. */
    @Volatile var aspectRatio: Rational = Rational(16, 9)

    /** True while the activity is in PiP mode. Set by MainActivity. */
    @Volatile var isInPipMode: Boolean = false

    /**
     * Callback invoked by MainActivity.onPictureInPictureModeChanged().
     * TvPlayerView registers here so it can fire the native view event
     * (onPipModeChange) which reaches JS reliably even with New Architecture.
     */
    @Volatile var onPipModeChanged: ((Boolean) -> Unit)? = null
}
