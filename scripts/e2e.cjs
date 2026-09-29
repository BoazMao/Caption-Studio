const { _electron: electron } = require("playwright");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  work = path.join(root, ".tools", "test-work", "e2e");
(async () => {
  await fs.mkdir(work, { recursive: true });
  const fixture = path.join(work, "real video & audio.mp4");
  execFileSync(
    require("ffmpeg-static"),
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "8",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      fixture,
    ],
    { stdio: "ignore", windowsHide: true },
  );
  const app = await electron.launch({
    args: [root, "--user-data-dir=" + path.join(work, "profile")],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE"),
    ),
  });
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => console.error("PAGE ERROR", e));
    await page
      .getByRole("button", { name: "Open local video", exact: true })
      .waitFor();
    await page.evaluate(
      async ({ ffmpeg, ffprobe }) => {
        const s = await window.studio.call("settings");
        await window.studio.call("configure", { ...s, ffmpeg, ffprobe });
      },
      {
        ffmpeg: require("ffmpeg-static"),
        ffprobe: require("ffprobe-static").path,
      },
    );
    const missingYtDlp = path.join(work, "missing-yt-dlp.exe");
    const previewError = await page.evaluate(async (missing) => {
      const settings = await window.studio.call("settings");
      await window.studio.call("configure", { ...settings, ytdlp: missing });
      try {
        await window.studio.call("preview", "https://example.com/video");
        return "";
      } catch (error) {
        return String(error);
      } finally {
        await window.studio.call("configure", settings);
      }
    }, missingYtDlp);
    assert.match(previewError, /Could not start .*missing-yt-dlp\.exe.*Settings/s);
    await app.evaluate(({ dialog }, fixture) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [fixture],
      });
    }, fixture);
    await page
      .getByRole("button", { name: "Open local video", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("video")?.readyState >= 2,
    );
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Waveform") &&
        document.body.innerText.includes("done"),
    );
    const sourceLanguage = page.getByLabel("Source language");
    const targetLanguage = page.getByLabel("Target language");
    assert.deepEqual(await sourceLanguage.locator("option").allTextContents(), [
      "English",
      "Chinese",
    ]);
    assert.deepEqual(await targetLanguage.locator("option").allTextContents(), [
      "English",
      "Chinese",
    ]);
    await sourceLanguage.selectOption("zh");
    await sourceLanguage.selectOption("en");
    await targetLanguage.selectOption("English");
    await targetLanguage.selectOption("Chinese");
    await page.getByLabel("Timeline zoom").fill("8");
    assert.equal(await page.getByLabel("Zoom level").textContent(), "256×");
    const zoomedTimeline = await page.evaluate(() => {
      const scroll = document.querySelector(".timeline-scroll");
      const canvas = scroll.querySelector("canvas");
      const ruler = scroll.querySelector(".ruler span");
      return {
        canvasWidth: canvas.width,
        viewportWidth: scroll.clientWidth,
        timelineWidth: scroll.scrollWidth,
        rulerSelection: getComputedStyle(ruler).userSelect,
      };
    });
    assert.ok(
      zoomedTimeline.timelineWidth > zoomedTimeline.viewportWidth * 200,
    );
    assert.ok(zoomedTimeline.canvasWidth <= zoomedTimeline.viewportWidth * 2);
    assert.equal(zoomedTimeline.rulerSelection, "none");
    await page.screenshot({
      path: path.join(root, "timeline-zoom-verification.png"),
    });
    await page.getByLabel("Timeline zoom").fill("0");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("video").currentTime > 0.3,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByLabel("Seek video").fill("3");
    await page.waitForFunction(
      () => Math.abs(document.querySelector("video").currentTime - 3) < 0.1,
    );
    await page.getByRole("button", { name: "Next frame", exact: true }).click();
    await page.waitForFunction(
      () =>
        Math.abs(document.querySelector("video").currentTime - (3 + 1 / 30)) <
        0.005,
    );
    await page.getByLabel("Timeline zoom").fill("8");
    await page.waitForFunction(() => {
      const scroll = document.querySelector(".timeline-scroll");
      const playhead = document
        .querySelector(".playhead")
        .getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      return (
        scroll.scrollLeft > 0 &&
        Math.abs(playhead.left - (viewport.left + viewport.width / 2)) <
          viewport.width * 0.1
      );
    });
    const centered = await page.evaluate(() => {
      const scroll = document.querySelector(".timeline-scroll");
      const playhead = document
        .querySelector(".playhead")
        .getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      return {
        scrollLeft: scroll.scrollLeft,
        distanceFromCenter: Math.abs(
          playhead.left - (viewport.left + viewport.width / 2),
        ),
        viewportWidth: viewport.width,
      };
    });
    assert.ok(centered.scrollLeft > 0);
    assert.ok(centered.distanceFromCenter < centered.viewportWidth * 0.1);
    await page.getByLabel("Timeline zoom").fill("0");
    await page
      .getByRole("button", { name: /Add caption/ })
      .first()
      .click();
    await page
      .getByLabel("Source caption 1", { exact: true })
      .fill("A real video, an editable caption.");
    await page
      .getByLabel("Translation caption 1", { exact: true })
      .fill("Un vídeo real, un subtítulo editable.");
    const projectFile = path.join(work, "roundtrip.captionproj");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, projectFile);
    await page.getByRole("button", { name: /Save project/ }).click();
    await page.waitForFunction(() =>
      document.body.innerText.includes("Project saved"),
    );
    const saved = JSON.parse(await fs.readFile(projectFile, "utf8"));
    assert.equal(
      saved.captions[0].source,
      "A real video, an editable caption.",
    );
    await page
      .getByLabel("Source caption 1", { exact: true })
      .fill("Changed source");
    await page.getByText("stale", { exact: true }).first().waitFor();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, projectFile);
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("textarea")?.value ===
        "A real video, an editable caption.",
    );
    await page.waitForFunction(() => !document.querySelector(".wave-label"));
    // Exercise timing edits through actual pointer and keyboard input.
    const before = Number(
      await page.getByLabel("Start 1", { exact: true }).inputValue(),
    );
    const bounds = await page
      .locator(".source-lane .clip")
      .first()
      .boundingBox();
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 40,
      bounds.y + bounds.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
    assert.ok(
      Number(await page.getByLabel("Start 1", { exact: true }).inputValue()) >
        before,
    );
    await page.getByTitle("Ctrl+Z", { exact: true }).click();
    assert.equal(
      Number(await page.getByLabel("Start 1", { exact: true }).inputValue()),
      before,
    );
    await page.getByTitle("Ctrl+Shift+Z", { exact: true }).click();
    assert.ok(
      Number(await page.getByLabel("Start 1", { exact: true }).inputValue()) >
        before,
    );
    await page.getByTitle("Ctrl+Z", { exact: true }).click();
    await page.getByLabel("Seek video").fill("4");
    await page.getByRole("button", { name: /^Split/ }).click();
    assert.equal(await page.locator(".caption-row").count(), 2);
    await page.getByRole("button", { name: /Merge next/ }).click();
    assert.equal(await page.locator(".caption-row").count(), 1);
    await page.getByTitle("Ctrl+Z", { exact: true }).click();
    await page.getByTitle("Ctrl+Z", { exact: true }).click();
    const previousUrl = await page.locator("video").getAttribute("src");
    await page.evaluate(async (project) => {
      await window.studio.call("compatible", project);
    }, saved);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".task")].some(
        (e) =>
          e.textContent.includes("Playback copy") &&
          e.textContent.includes("done"),
      ),
    );
    await page.waitForFunction((old) => {
      const v = document.querySelector("video");
      return (
        v?.readyState >= 2 &&
        v.currentSrc !== old &&
        v.currentSrc === v.getAttribute("src")
      );
    }, previousUrl);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("video").currentTime > 0.2,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".task.running"));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, "verification.png") });
    console.log(
      "PASS: real H.264/AAC playback, pause, seek, frame step, waveform, edit, stale translation, save/reopen, drag, split, merge, undo/redo, compatible preview conversion",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
