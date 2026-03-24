const { withAndroidManifest } = require("expo/config-plugins");

function withNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (application) {
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return config;
  });

  return config;
}

module.exports = withNetworkSecurityConfig;
