const fs = require("node:fs/promises");
const path = require("node:path");
module.exports = async ({ packager }) => {
  for (const file of [
    "yt-dlp.exe",
    "manifest.json",
    "whisper/whisper-cli.exe",
    "whisper/whisper.dll",
    "whisper/ggml.dll",
    "whisper/ggml-base.dll",
    "whisper/ggml-cpu.dll",
  ]) {
    try {
      await fs.access(
        path.join(packager.projectDir, ".tools/bundled-tools", file),
      );
    } catch {
      throw Error(
        `Missing bundled tool ${file}. Run npm run prepare:tools before packaging.`,
      );
    }
  }
};
