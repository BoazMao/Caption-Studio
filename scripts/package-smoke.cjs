const { _electron: electron } = require("playwright");
const path = require("node:path");
const fs = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  work = path.join(root, ".tools", "test-work");
(async () => {
  const profile = path.join(work, "packaged-profile-" + Date.now());
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      ffmpeg: "ffmpeg",
      ffprobe: "ffprobe",
      ytdlp: "yt-dlp",
      whisper: "whisper-cli",
    }),
  );
  const app = await electron.launch({
    executablePath: path.join(root, "release/win-unpacked/Raccoon Studio.exe"),
    args: ["--user-data-dir=" + profile],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE"),
    ),
  });
  try {
    const page = await app.firstWindow();
    if ((await page.title()) !== "Raccoon Studio")
      throw Error("Incorrect app title");
    await page.waitForFunction(
      () => document.querySelector("img.logo")?.naturalWidth > 0,
    );
    await page
      .getByRole("button", { name: "Open local video", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /^⚙ Settings$/ }).click();
    await page
      .getByRole("button", { name: "Install WhisperX", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /^⚙ Settings$/ }).click();
    const tools = await page.evaluate(() => window.studio.call("settings"));
    for (const key of ["ytdlp", "whisper"]) {
      if (!tools[key].includes("resources"))
        throw Error(`${key} was not bundled`);
      await fs.access(tools[key]);
    }
    execFileSync(tools.ytdlp, ["--version"], { windowsHide: true });
    execFileSync(tools.whisper, ["--help"], {
      windowsHide: true,
      stdio: "pipe",
    });
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
      persisted.ffprobe !== "$BUNDLED_FFPROBE" ||
      persisted.ytdlp !== "$BUNDLED_YTDLP" ||
      persisted.whisper !== "$BUNDLED_WHISPER"
    )
      throw Error("The packaged tool selection was saved as a temporary path");
    await page.evaluate(() => {
      window.speechCheck = null;
      window.studio.onEvent((e) => {
        if (e.type === "job" && e.job.kind === "WhisperX setup")
          window.speechCheck = e.job;
      });
      return window.studio.call("checkSpeech");
    });
    await page.waitForFunction(
      () => window.speechCheck && window.speechCheck.state !== "running",
      null,
      { timeout: 120000 },
    );
    const speech = await page.evaluate(() => window.speechCheck);
    if (speech.state !== "done")
      throw Error("Packaged WhisperX worker failed: " + speech.message);
    console.log(
      "PASS: packaged WhisperX worker imports the installed Python runtime",
    );
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
