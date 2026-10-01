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
    ...(process.env.TEST_PACKAGED
      ? {
          executablePath: path.join(
            root,
            "release/win-unpacked/Raccoon Studio.exe",
          ),
        }
      : {}),
    args: [
      ...(process.env.TEST_PACKAGED ? [] : [root]),
      "--user-data-dir=" +
        path.join(
          work,
          process.env.TEST_PACKAGED ? "packaged-profile" : "profile",
        ),
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE"),
    ),
  });
  try {
    const page = await app.firstWindow();
    assert.equal(await page.title(), "Raccoon Studio");
    await page.waitForFunction(
      () => document.querySelector("img.logo")?.naturalWidth > 0,
    );
    page.on("pageerror", (e) => console.error("PAGE ERROR", e));
    await page
      .getByRole("button", { name: "Open local video", exact: true })
      .waitFor();
    await page.evaluate(
      async ({ ffmpeg, ffprobe }) => {
        const s = await window.studio.call("settings");
        await window.studio.call("configure", {
          ...s,
          ...(ffmpeg ? { ffmpeg, ffprobe } : {}),
        });
      },
      {
        ffmpeg: process.env.TEST_PACKAGED ? null : require("ffmpeg-static"),
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
    assert.match(
      previewError,
      /Could not start .*missing-yt-dlp\.exe.*Settings/s,
    );
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
    // Inspection can finish before audio analysis; wait for rendered peaks.
    await page.waitForFunction(() => !document.querySelector(".wave-label"));
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
    assert.equal(await page.locator(".lane").count(), 1);
    assert.equal(await page.locator(".lane .clip").count(), 1);
    assert.ok(
      (await page.locator(".lane .clip").innerText()).includes("Un vídeo real"),
    );
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
    assert.equal(saved.waveform.encoding, "deflate-u16le");
    assert.equal(saved.waveform.source.path, fixture);
    assert.ok(saved.waveform.peakCount > 0);
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
    const playbackSettings = await page.evaluate(
      async (missingFFmpeg) => {
        const settings = await window.studio.call("settings");
        window.waveEvents = [];
        window.studio.onEvent((e) => {
          if (e.type === "wave") window.waveEvents.push(e);
        });
        await window.studio.call("configure", {
          ...settings,
          ffmpeg: missingFFmpeg,
        });
        return settings;
      },
      path.join(work, "missing-ffmpeg.exe"),
    );
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("textarea")?.value ===
        "A real video, an editable caption.",
    );
    await page.waitForFunction(() => !document.querySelector(".wave-label"));
    assert.equal(
      await page.evaluate(() => window.waveEvents.at(-1)?.reused),
      true,
    );
    await page.evaluate(
      (settings) => window.studio.call("configure", settings),
      playbackSettings,
    );
    const restoredWave = await page
      .locator("canvas")
      .evaluate((el) => el.toDataURL());
    await app.evaluate(
      ({ BrowserWindow }, event) => {
        BrowserWindow.getAllWindows()[0].webContents.send(
          "studio:event",
          event,
        );
      },
      {
        type: "wave",
        projectId: saved.id,
        requestId: "00000000-0000-4000-8000-000000000000",
        peaks: [0],
        waveform: saved.waveform,
        reused: false,
      },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await page.locator("canvas").evaluate((el) => el.toDataURL()),
      restoredWave,
      "An obsolete waveform job must not replace the current waveform",
    );
    await fs.writeFile(
      projectFile,
      JSON.stringify({
        ...saved,
        waveform: { ...saved.waveform, data: "corrupt-cache" },
      }),
    );
    await page.evaluate(() => {
      window.waveEvents = [];
    });
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await page.waitForFunction(() => window.waveEvents.some((e) => !e.reused));
    await page.waitForFunction(() => !document.querySelector(".wave-label"));
    console.log(
      "PASS: saved waveform reopens without FFmpeg, obsolete results are ignored, corrupt cache regenerates",
    );
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
    // Caption editing shortcuts use the OS clipboard and keep linked tracks together.
    const initialCount = await page.locator(".caption-row").count();
    const firstStart = await page
      .getByLabel("Start 1", { exact: true })
      .inputValue();
    await page.getByLabel("Seek video").fill(firstStart);
    await page.locator(".timeline").focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    await page.waitForFunction(() =>
      document.body.innerText.includes("captions copied"),
    );
    await page.keyboard.press("Control+v");
    await page.waitForFunction(
      (n) => document.querySelectorAll(".caption-row").length === n * 2,
      initialCount,
    );
    assert.equal(
      await page.locator(".source-lane .overlap-warning").count(),
      2,
    );
    const overlapStyles = await page
      .locator(".source-lane .clip.overlap")
      .evaluateAll((clips) =>
        clips.map((c) => ({
          selected: c.classList.contains("chosen"),
          border: getComputedStyle(c).borderTopColor,
          width: getComputedStyle(c).borderTopWidth,
          warning: getComputedStyle(c.querySelector(".overlap-warning"))
            .backgroundColor,
        })),
      );
    assert.ok(overlapStyles.some((c) => !c.selected));
    assert.ok(overlapStyles.some((c) => c.selected));
    assert.ok(overlapStyles.every((c) => c.border !== c.warning));
    assert.ok(
      overlapStyles
        .filter((c) => c.selected)
        .every(
          (c) =>
            parseFloat(c.width) >
              Math.max(
                ...overlapStyles
                  .filter((x) => !x.selected)
                  .map((x) => parseFloat(x.width)),
              ) && c.border === "rgb(188, 239, 220)",
        ),
      JSON.stringify(overlapStyles),
    );
    await page.keyboard.press("Control+z");
    assert.equal(await page.locator(".caption-row").count(), initialCount);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.locator(".caption-row").count(), initialCount * 2);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+x");
    await page.waitForFunction(() => !document.querySelector(".caption-row"));
    await page.keyboard.press("Control+z");
    assert.equal(await page.locator(".caption-row").count(), initialCount * 2);
    const sourceField = page.getByLabel("Source caption 1", { exact: true });
    await page.locator(".timeline").focus();
    await page.keyboard.press("Control+a");
    const groupStart = Number(
      await page.getByLabel("Start 1", { exact: true }).inputValue(),
    );
    const groupSecondStart = Number(
      await page.getByLabel("Start 2", { exact: true }).inputValue(),
    );
    const groupBox = await page
      .locator(".source-lane .clip")
      .last()
      .boundingBox();
    await page.mouse.move(groupBox.x + 30, groupBox.y + 12);
    await page.mouse.down();
    await page.mouse.move(groupBox.x + 70, groupBox.y + 12, { steps: 4 });
    await page.mouse.up();
    assert.ok(
      Number(await page.getByLabel("Start 1", { exact: true }).inputValue()) >
        groupStart,
    );
    const movedFirst =
      Number(await page.getByLabel("Start 1", { exact: true }).inputValue()) -
      groupStart;
    const movedSecond =
      Number(await page.getByLabel("Start 2", { exact: true }).inputValue()) -
      groupSecondStart;
    assert.ok(
      Math.abs(movedFirst - movedSecond) <= 0.0011,
      "group drag preserves relative timing to displayed millisecond precision",
    );
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Delete");
    assert.equal(await page.locator(".caption-row").count(), 0);
    await page.keyboard.press("Control+z");
    await sourceField.focus();
    await page.keyboard.press("Control+a");
    assert.equal(
      await sourceField.evaluate((el) => el.selectionEnd - el.selectionStart),
      (await sourceField.inputValue()).length,
    );
    const layout = await page.evaluate(() => {
      const wave = document.querySelector("canvas").getBoundingClientRect();
      return [...document.querySelectorAll(".lane")].every((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= wave.top && box.bottom <= wave.bottom;
      });
    });
    assert.ok(layout, "caption lanes overlay the waveform");
    const waveBefore = await page
      .locator("canvas")
      .evaluate((el) => el.toDataURL());
    await page.getByLabel("Timeline zoom").fill("5");
    await page.waitForFunction(
      (before) => document.querySelector("canvas").toDataURL() !== before,
      waveBefore,
    );
    assert.ok(
      await page
        .locator("canvas")
        .evaluate(
          (el) =>
            el.clientWidth <=
            document.querySelector(".timeline-scroll").clientWidth,
        ),
    );
    await page.getByLabel("Timeline zoom").fill("0");
    console.log(
      "PASS: waveform overlays/zoom, caption clipboard, multi-selection, overlap warnings, native text selection and undo/redo",
    );
    await page.getByLabel("Transcription import mode").selectOption("replace");
    const beforeCount = await page.locator(".caption-row").count();
    const beforeText = await page
      .getByLabel("Source caption 1", { exact: true })
      .inputValue();
    // Flush the current editor state instead of accepting an older autosave
    // whose text matches but whose sub-millisecond timing is different.
    const previousWrite = (await fs.stat(projectFile)).mtimeMs;
    await page.getByRole("button", { name: /Save project/ }).click();
    let flushed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await fs.stat(projectFile)).mtimeMs !== previousWrite) {
        flushed = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    assert.ok(flushed, "Current editor snapshot was not saved");
    const currentProject = JSON.parse(await fs.readFile(projectFile, "utf8"));
    assert.equal(currentProject.captions.length, beforeCount);
    const replacement = {
      id: "new-sentence",
      start: 1,
      end: 2,
      source: "A complete new sentence.",
      target: "",
      status: "empty",
    };
    const run = {
      id: "ui-run",
      createdAt: "2026-09-30",
      mode: "transcription",
      raw: { custom: { retained: true } },
      captions: [replacement],
    };
    await app.evaluate(
      ({ BrowserWindow }, data) =>
        BrowserWindow.getAllWindows()[0].webContents.send("studio:event", data),
      {
        type: "captions",
        projectId: currentProject.id,
        language: currentProject.language,
        mode: "replace",
        originals: currentProject.captions,
        captions: [replacement],
        speechRun: run,
      },
    );
    await page
      .waitForFunction(
        () =>
          document.querySelector('[aria-label="Source caption 1"]')?.value ===
          "A complete new sentence.",
      )
      .catch(async (e) => {
        console.error(
          "Replacement diagnostic:",
          await page.evaluate(() => document.body.innerText.slice(-1400)),
          currentProject,
        );
        throw e;
      });
    assert.equal(await page.locator(".caption-row").count(), 1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await page.locator(".caption-row").count(), beforeCount);
    assert.equal(
      await page.getByLabel("Source caption 1", { exact: true }).inputValue(),
      beforeText,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    assert.equal(
      await page.getByLabel("Source caption 1", { exact: true }).inputValue(),
      replacement.source,
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByLabel("Transcription import mode").selectOption("add");
    await app.evaluate(
      ({ BrowserWindow }, data) =>
        BrowserWindow.getAllWindows()[0].webContents.send("studio:event", data),
      {
        type: "captions",
        projectId: currentProject.id,
        mode: "add",
        captions: [replacement],
      },
    );
    await page.waitForFunction(
      (n) => document.querySelectorAll(".caption-row").length === n,
      beforeCount + 1,
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    console.log(
      "PASS: explicit add/replace transcription imports with undo and redo",
    );
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
