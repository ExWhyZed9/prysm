const {
  withAndroidManifest,
  withAppBuildGradle,
  withSettingsGradle,
} = require("expo/config-plugins");
const path = require("path");

const RECEIVER_CLASS = "expo.modules.tvchannel.TvChannelReceiver";

function withTvChannel(config) {
  // 1. Add permissions + BroadcastReceiver to AndroidManifest
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const perms = manifest["uses-permission"].map((p) => p.$["android:name"]);

    // READ + WRITE EPG_DATA — required to query, insert, and update
    // preview channels and programs via ContentResolver.
    const requiredPerms = [
      "com.android.providers.tv.permission.READ_EPG_DATA",
      "com.android.providers.tv.permission.WRITE_EPG_DATA",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ];
    for (const perm of requiredPerms) {
      if (!perms.includes(perm)) {
        manifest["uses-permission"].push({
          $: { "android:name": perm },
        });
      }
    }

    // TvChannelReceiver — re-publishes the preview channel after device
    // reboot and when the launcher requests channel re-initialization.
    // SmartTube uses BOOT_COMPLETED + SCREEN_ON instead of (or alongside)
    // ACTION_INITIALIZE_PROGRAMS for broader launcher compatibility.
    const app = manifest.application[0];
    if (!app.receiver) app.receiver = [];
    const receiverExists = app.receiver.some(
      (r) => r.$["android:name"] === RECEIVER_CLASS,
    );
    if (!receiverExists) {
      app.receiver.push({
        $: {
          "android:name": RECEIVER_CLASS,
          "android:exported": "true",
          "android:enabled": "true",
        },
        "intent-filter": [
          {
            category: [
              {
                $: { "android:name": "android.intent.category.DEFAULT" },
              },
            ],
            action: [
              {
                $: {
                  "android:name": "android.intent.action.BOOT_COMPLETED",
                },
              },
              {
                $: {
                  "android:name": "android.intent.action.QUICKBOOT_POWERON",
                },
              },
              {
                $: {
                  "android:name":
                    "androidx.tvprovider.media.tv.action.INITIALIZE_PROGRAMS",
                },
              },
            ],
          },
        ],
      });
    }

    return cfg;
  });

  // 2. Include the local module in settings.gradle
  config = withSettingsGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(":tv-channel")) {
      cfg.modResults.contents += `\ninclude ':tv-channel'\nproject(':tv-channel').projectDir = new File(rootProject.projectDir, '../modules/tv-channel/android')\n`;
    }
    return cfg;
  });

  // 3. Add the module as a dependency in app/build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("tv-channel")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        "dependencies {\n    implementation project(':tv-channel')",
      );
    }
    return cfg;
  });

  return config;
}

module.exports = withTvChannel;
