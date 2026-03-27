const {
  withAndroidManifest,
  withAppBuildGradle,
  withSettingsGradle,
} = require("expo/config-plugins");

/**
 * Expo config plugin for tv-player.
 *
 * Wires the native ExoPlayer module into the Android build and injects:
 *  - FOREGROUND_SERVICE + FOREGROUND_SERVICE_MEDIA_PLAYBACK permissions
 *  - TvPlayerService declaration (needed for background audio on TV)
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

  return config;
}

module.exports = withTvPlayer;
