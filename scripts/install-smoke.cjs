// Opt-in network test: installs a private runtime in an ignored test profile.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const root = path.resolve(__dirname, "..");
const profile = path.join(root, ".tools/test-work/installer-profile");
(async () => {
  await fs.mkdir(profile, { recursive: true });
  const launch = () =>
    electron.launch({
      args: [root, "--user-data-dir=" + profile],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key !== "ELECTRON_RUN_AS_NODE",
        ),
      ),
    });
  let app = await launch();
  try {
    if (process.env.TEST_INSTALL_HIDE)
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.hide()),
      );
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: false }).click();
    await page.evaluate(() => {
      window.installJob = null;
      window.studio.onEvent((e) => {
        if (e.type === "job" && e.job.kind === "WhisperX installation")
          window.installJob = e.job;
      });
    });
    await page
      .getByRole("button", { name: "Install WhisperX", exact: true })
      .click();
    await page.waitForFunction(() => window.installJob);
    const initial = await page.evaluate(() => window.installJob);
    assert.equal(initial.state, "running", initial.message);
    const id = initial.id;
    assert.equal(
      await page.evaluate(() => window.studio.call("installSpeech")),
      id,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Installing WhisperX…", exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({
      path: path.join(root, ".tools/test-work/installer-settings.png"),
    });
    let previous = "";
    const end = Date.now() + 15 * 60 * 1000;
    while (Date.now() < end) {
      const job = await page.evaluate(() => window.installJob);
      if (job.message !== previous) {
        console.log(job.message);
        previous = job.message;
      }
      if (job.state !== "running") {
        assert.equal(job.state, "done", job.message);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    assert.equal((await page.evaluate(() => window.installJob)).state, "done");
    const settings = await page.evaluate(() => window.studio.call("settings"));
    assert.ok(settings.whisperxPython.startsWith(profile));
    assert.equal(settings.whisperxDevice, "cpu");
    assert.equal(settings.speechEngine, "whisperx");
    await page
      .locator("footer")
      .filter({
        hasText:
          "WhisperX installed and selected. Models download on first transcription.",
      })
      .waitFor();
    await page.screenshot({
      path: path.join(root, ".tools/test-work/installer-ready.png"),
    });
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    const restored = await reopened.evaluate(() =>
      window.studio.call("settings"),
    );
    assert.equal(restored.whisperxPython, settings.whisperxPython);
    console.log(
      "PASS: Settings installation, duplicate prevention, automatic selection, private Python and reopen persistence",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
