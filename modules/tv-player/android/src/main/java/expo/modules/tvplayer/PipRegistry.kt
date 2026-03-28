package expo.modules.tvplayer

import android.util.Rational

/**
 * Bridges TvPlayerView ↔ MainActivity for PiP.
 *
 * TvPlayerView sets [isPlayerActive] = true when a source is loaded and playing,
 * false when released. MainActivity reads this in onUserLeaveHint() to decide
 * whether to auto-enter PiP.
 */
object PipRegistry {
    /** True when a player is active and PiP should be triggered on Home press. */
    @Volatile var isPlayerActive: Boolean = false

    /** Aspect ratio for the PiP window — updated when video size changes. */
    @Volatile var aspectRatio: Rational = Rational(16, 9)
}
