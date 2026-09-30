import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installWhisperX, managedPython } from "../src/main/install-whisperx";
import type { run } from "../src/main/jobs";

test("installer activates only verified environments and preserves previous runtime on failure/cancel", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "raccoon-install-"));
  let fail = false;
  let cancelDuringInstall = false;
  const controller = new AbortController();
  const runner: typeof run = async (_exe, args, signal) => {
    signal.throwIfAborted();
    if (args[0] === "venv") {
      const scripts = path.join(args.at(-1)!, "Scripts");
      await mkdir(scripts, { recursive: true });
      await writeFile(path.join(scripts, "python.exe"), "test placeholder");
    }
    if (fail && args[0] === "-I") throw Error("Module import failed");
    if (cancelDuringInstall && args[0] === "pip") {
      controller.abort();
      signal.throwIfAborted();
    }
    return "";
  };
  const options = {
    runner,
    bootstrap: async () => "test-uv.exe",
    checkDisk: false,
  };
  try {
    const first = await installWhisperX(
      root,
      controller.signal,
      () => {},
      options,
    );
    assert.equal(await managedPython(root), first);
    fail = true;
    await assert.rejects(
      installWhisperX(root, controller.signal, () => {}, options),
      /Module import failed/,
    );
    assert.equal(await managedPython(root), first);
    assert.equal((await readdir(path.join(root, "environments"))).length, 1);
    fail = false;
    cancelDuringInstall = true;
    await assert.rejects(
      installWhisperX(root, controller.signal, () => {}, options),
    );
    assert.equal(await managedPython(root), first);
    assert.equal((await readdir(path.join(root, "environments"))).length, 1);
    await writeFile(
      path.join(root, "current.json"),
      JSON.stringify({
        key: "whisperx-3.8.6-python-3.12.14-cpu-v1",
        python: "../external/python.exe",
      }),
    );
    assert.equal(await managedPython(root), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
