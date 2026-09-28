const { _electron: electron } = require("playwright");
const path = require("node:path");
const fs = require("node:fs/promises");
const root = path.resolve(__dirname, ".."),
  work = path.resolve(root, "../../work");
(async () => {
  const profile = path.join(work, "packaged-profile-" + Date.now());
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({ ffmpeg: "ffmpeg", ffprobe: "ffprobe" }),
  );
  const app = await electron.launch({
    executablePath: path.join(root, "release/win-unpacked/Caption Studio.exe"),
    args: ["--user-data-dir=" + profile],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE"),
    ),
  });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "Your story, clearly told." })
      .waitFor();
    const tools = await page.evaluate(() => window.studio.call("settings"));
    if (
      !tools.ffmpeg.includes("resources") ||
      !tools.ffprobe.includes("resources")
    )
      throw Error("Packaged media tools were not selected automatically");
    await page.evaluate(async () => {
      await window.studio.call(
        "configure",
        await window.studio.call("settings"),
      );
    });
    const persisted = JSON.parse(
      await fs.readFile(path.join(profile, "settings.json"), "utf8"),
    );
    if (
      persisted.ffmpeg !== "$BUNDLED_FFMPEG" ||
      persisted.ffprobe !== "$BUNDLED_FFPROBE"
    )
      throw Error("The packaged tool selection was saved as a temporary path");
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      },
      path.join(work, "e2e/real video & audio.mp4"),
    );
    await page
      .getByRole("button", { name: "Open local video", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("video")?.readyState >= 2,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("video").currentTime > 0.2,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".wave-label"));
    console.log(
      "PASS: packaged ASAR app launches, preload bridge works, real video plays and waveform renders",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
