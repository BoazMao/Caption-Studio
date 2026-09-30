import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readdir,
  rename,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installWhisperX, managedPython } from "../src/main/install-whisperx";
import { Jobs, type run } from "../src/main/jobs";

function environmentRunner(
  pip?: (signal: AbortSignal) => Promise<void>,
): typeof run {
  return async (_exe, args, signal) => {
    signal.throwIfAborted();
    if (args[0] === "venv") {
      const scripts = path.join(args.at(-1)!, "Scripts");
      await mkdir(scripts, { recursive: true });
      await writeFile(path.join(scripts, "python.exe"), "test placeholder");
    }
    if (args[0] === "pip") await pip?.(signal);
    return "";
  };
}

test("activation cannot become cancelled during marker rename or settings persistence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "raccoon-commit-"));
  const jobs = new Jobs(() => {});
  let started!: () => void, release!: () => void;
  const committing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let selected: string | undefined;
  const id = jobs.start(
    "WhisperX installation",
    async (signal, update, beginCommit) => {
      const python = await installWhisperX(root, signal, update, {
        runner: environmentRunner(),
        bootstrap: async () => "test-uv.exe",
        checkDisk: false,
        beginCommit,
        renameMarker: async (from, to) => {
          started();
          await held;
          await rename(from, to);
        },
      });
      jobs.cancel(id); // A second request while settings persistence is pending.
      await new Promise((resolve) => setTimeout(resolve, 10));
      selected = python;
    },
  );
  try {
    await committing;
    const entry = jobs.active.get(id)!;
    jobs.cancel(id);
    assert.equal(entry.controller.signal.aborted, false);
    assert.equal(entry.job.cancellable, false);
    let drained = false;
    const closing = jobs.cancelAllAndWait().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(drained, false);
    release();
    await closing;
    assert.equal(entry.job.state, "done");
    assert.equal(await managedPython(root), selected);
    assert.equal(jobs.active.size, 0);
  } finally {
    release();
    await jobs.cancelAllAndWait();
    await rm(root, { recursive: true, force: true });
  }
});

test("shutdown waits for cancelled installer cleanup and preserves the previous runtime", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "raccoon-shutdown-"));
  const jobs = new Jobs(() => {});
  const options = {
    runner: environmentRunner(),
    bootstrap: async () => "test-uv.exe",
    checkDisk: false,
  };
  try {
    const previous = await installWhisperX(
      root,
      new AbortController().signal,
      () => {},
      options,
    );
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const id = jobs.start(
      "WhisperX installation",
      async (signal, update, beginCommit) => {
        await installWhisperX(root, signal, update, {
          ...options,
          beginCommit,
          runner: environmentRunner(async (signal) => {
            started();
            await new Promise<void>((_, reject) =>
              signal.addEventListener(
                "abort",
                () => reject(Error("Cancelled")),
                { once: true },
              ),
            );
          }),
        });
      },
    );
    await running;
    const entry = jobs.active.get(id)!;
    await jobs.cancelAllAndWait();
    assert.equal(entry.job.state, "cancelled");
    assert.equal(jobs.active.size, 0);
    assert.equal(await managedPython(root), previous);
    assert.equal((await readdir(path.join(root, "environments"))).length, 1);
  } finally {
    await jobs.cancelAllAndWait();
    await rm(root, { recursive: true, force: true });
  }
});

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
