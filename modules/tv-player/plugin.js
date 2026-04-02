const {
  withAndroidManifest,
  withAppBuildGradle,
  withSettingsGradle,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin for tv-player.
 *
 * Wires the native ExoPlayer module into the Android build and injects:
 *  - FOREGROUND_SERVICE + FOREGROUND_SERVICE_MEDIA_PLAYBACK permissions
 *  - TvPlayerService declaration (needed for background audio on TV)
 *  - PiP handling in MainActivity (onUserLeaveHint, onPictureInPictureModeChanged)
 *  - settings.gradle / app/build.gradle entries
 */
function withTvPlayer(config) {
  // 1. AndroidManifest — permissions + service declaration
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Permissions
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const existingPerms = manifest["uses-permission"].map(
      (p) => p.$["android:name"],
    );

    const requiredPerms = [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      // Required to post the media playback notification on Android 13+ (API 33)
      "android.permission.POST_NOTIFICATIONS",
    ];
    for (const perm of requiredPerms) {
      if (!existingPerms.includes(perm)) {
        manifest["uses-permission"].push({ $: { "android:name": perm } });
      }
    }

    // Picture-in-Picture support on the main activity
    const activities = manifest.application?.[0]?.activity ?? [];
    const mainActivity = activities.find(
      (a) => a.$?.["android:name"] === ".MainActivity",
    );
    if (mainActivity) {
      mainActivity.$["android:supportsPictureInPicture"] = "true";
      // Ensure configChanges includes smallestScreenSize so the activity
      // doesn't recreate when entering/exiting PiP
      const existing = mainActivity.$["android:configChanges"] ?? "";
      if (!existing.includes("smallestScreenSize")) {
        mainActivity.$["android:configChanges"] =
          existing + "|smallestScreenSize";
      }
    }

    // Service declaration inside <application>
    const application = manifest.application?.[0];
    if (application) {
      if (!application.service) application.service = [];
      const serviceNames = application.service.map(
        (s) => s.$?.["android:name"],
      );
      if (!serviceNames.includes("expo.modules.tvplayer.TvPlayerService")) {
        application.service.push({
          $: {
            "android:name": "expo.modules.tvplayer.TvPlayerService",
            "android:exported": "true",
            "android:foregroundServiceType": "mediaPlayback",
          },
          "intent-filter": [
            {
              action: [
                {
                  $: {
                    "android:name":
                      "androidx.media3.session.MediaSessionService",
                  },
                },
              ],
            },
          ],
        });
      }
    }

    return cfg;
  });

  // 2. settings.gradle — include the local module project
  config = withSettingsGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(":tv-player")) {
      cfg.modResults.contents += `\ninclude ':tv-player'\nproject(':tv-player').projectDir = new File(rootProject.projectDir, '../modules/tv-player/android')\n`;
    }
    return cfg;
  });

  // 3. app/build.gradle — add implementation dependency
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("tv-player")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        "dependencies {\n    implementation project(':tv-player')",
      );
    }
    return cfg;
  });

  // 4. MainActivity.kt — inject PiP handling (auto-enter on Home, relay state to JS)
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const pkg = cfg.android?.package ?? "com.prysmplayer.app";
      const mainActivityPath = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...pkg.split("."),
        "MainActivity.kt",
      );

      if (!fs.existsSync(mainActivityPath)) return cfg;

      let src = fs.readFileSync(mainActivityPath, "utf-8");

      // Skip if already patched
      if (src.includes("PipRegistry")) return cfg;

      // --- Add imports ---
      const pipImports = [
        "import android.app.PictureInPictureParams",
        "import android.content.res.Configuration",
        "import android.util.Rational",
        "import com.facebook.react.bridge.Arguments",
        "import com.facebook.react.modules.core.DeviceEventManagerModule",
        "import expo.modules.tvplayer.PipRegistry",
      ];
      for (const imp of pipImports) {
        if (!src.includes(imp)) {
          // Insert after the last existing import
          src = src.replace(/(import [^\n]+\n)(?!import)/, `$1${imp}\n`);
        }
      }

      // --- Add PiP methods before the final closing brace of the class ---
      const pipMethods = `
    /**
     * Auto-enter PiP when the user presses Home while the player is active.
     * PipRegistry is set by TvPlayerView when a source is loaded on mobile.
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && PipRegistry.isPlayerActive) {
            try {
                val ratio = PipRegistry.aspectRatio
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(ratio.numerator, ratio.denominator))
                    .apply {
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                            setAutoEnterEnabled(true)
                            setSeamlessResizeEnabled(true)
                        }
                    }
                    .build()
                enterPictureInPictureMode(params)
            } catch (_: Exception) {}
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        PipRegistry.isInPipMode = isInPictureInPictureMode

        // Notify TvPlayerView so it can fire the native view event
        // (onPipModeChange). This is the primary path — it works with both
        // old and new React Native architectures.
        PipRegistry.onPipModeChanged?.invoke(isInPictureInPictureMode)

        // Force the entire view tree to re-measure after the PiP window resize.
        window.decorView.rootView.requestLayout()

        // Also emit via DeviceEventEmitter as a fallback for non-view listeners.
        try {
            val reactContext = reactInstanceManager?.currentReactContext ?: return
            val params = Arguments.createMap().apply {
                putBoolean("isInPiP", isInPictureInPictureMode)
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onPipModeChanged", params)
        } catch (_: Exception) {}
    }
`;

      // Insert before the last closing brace of the class
      const lastBrace = src.lastIndexOf("}");
      src = src.slice(0, lastBrace) + pipMethods + src.slice(lastBrace);

      fs.writeFileSync(mainActivityPath, src, "utf-8");
      return cfg;
    },
  ]);

  return config;
}

module.exports = withTvPlayer;
