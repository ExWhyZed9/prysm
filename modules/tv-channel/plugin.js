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

    // WRITE_EPG_DATA — required to insert preview channels and programs
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const perms = manifest["uses-permission"].map((p) => p.$["android:name"]);
    if (!perms.includes("com.android.providers.tv.permission.WRITE_EPG_DATA")) {
      manifest["uses-permission"].push({
        $: {
          "android:name": "com.android.providers.tv.permission.WRITE_EPG_DATA",
        },
      });
    }

    // TvChannelReceiver — re-publishes the preview channel after device reboot.
    // ACTION_INITIALIZE_PROGRAMS is broadcast by the launcher to all apps that
    // have previously registered a preview channel, asking them to re-publish.
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
        },
        "intent-filter": [
          {
            action: [
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
