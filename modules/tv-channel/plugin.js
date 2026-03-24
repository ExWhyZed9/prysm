const { withAndroidManifest, withAppBuildGradle, withSettingsGradle } = require("expo/config-plugins");
const path = require("path");

function withTvChannel(config) {
  // 1. Add WRITE_EPG_DATA permission to AndroidManifest
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const perms = manifest["uses-permission"].map((p) => p.$["android:name"]);
    if (!perms.includes("com.android.providers.tv.permission.WRITE_EPG_DATA")) {
      manifest["uses-permission"].push({
        $: { "android:name": "com.android.providers.tv.permission.WRITE_EPG_DATA" },
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
        "dependencies {\n    implementation project(':tv-channel')"
      );
    }
    return cfg;
  });

  return config;
}

module.exports = withTvChannel;
