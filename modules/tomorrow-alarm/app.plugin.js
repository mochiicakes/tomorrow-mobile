const { withProjectBuildGradle } = require('expo/config-plugins');

// Spotify's App Remote AAR isn't on any public maven repo, so the module
// vendors it as a local repo. Every project that resolves it needs the repo.
const MARKER = '// tomorrow-alarm: spotify app remote';
const REPO = `${MARKER}
allprojects {
  repositories {
    maven { url "$rootDir/../modules/tomorrow-alarm/android/maven" }
  }
}
`;

module.exports = function withTomorrowAlarm(config) {
  return withProjectBuildGradle(config, cfg => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `\n${REPO}`;
    }
    return cfg;
  });
};
