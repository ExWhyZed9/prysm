const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withAndroidTVBanner(config, props = {}) {
  const bannerImage = props.banner || "./assets/images/android-tv-banner.png";

  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (application) {
      application.$["android:banner"] = "@drawable/tv_banner";

      const mainActivity = application.activity?.find(
        (a) => a.$["android:name"] === ".MainActivity"
      );
      if (mainActivity) {
        if (!mainActivity["intent-filter"]) {
          mainActivity["intent-filter"] = [];
        }
        const hasLeanback = mainActivity["intent-filter"].some((filter) =>
          filter.category?.some(
            (cat) =>
              cat.$["android:name"] === "android.intent.category.LEANBACK_LAUNCHER"
          )
        );
        if (!hasLeanback) {
          mainActivity["intent-filter"].push({
            action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
            category: [
              { $: { "android:name": "android.intent.category.LEANBACK_LAUNCHER" } },
            ],
          });
        }
      }
    }

    if (!manifest["uses-feature"]) {
      manifest["uses-feature"] = [];
    }
    const hasTouchscreen = manifest["uses-feature"].some(
      (f) => f.$["android:name"] === "android.hardware.touchscreen"
    );
    if (!hasTouchscreen) {
      manifest["uses-feature"].push({
        $: {
          "android:name": "android.hardware.touchscreen",
          "android:required": "false",
        },
      });
    }

    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const bannerSrc = path.resolve(projectRoot, bannerImage);
      const drawableDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "drawable"
      );

      if (!fs.existsSync(drawableDir)) {
        fs.mkdirSync(drawableDir, { recursive: true });
      }

      if (fs.existsSync(bannerSrc)) {
        fs.copyFileSync(bannerSrc, path.join(drawableDir, "tv_banner.png"));
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withAndroidTVBanner;
