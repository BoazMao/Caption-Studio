import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, utimes, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { blank, ProjectSchema } from "../src/shared/model";
import {
  MAX_WAVEFORM_PEAKS,
  waveformMatchesMedia,
} from "../src/shared/waveform";
import {
  restoreWaveform,
  saveWaveform,
  waveformSource,
} from "../src/main/waveform";
import { readProject, writeProject } from "../src/main/storage";

const source = {
  path: "C:\\video.mp4",
  size: 1234,
  modifiedAtMs: 1000,
  duration: 10,
};
const peaks = [0, 1 / 32768, 0.25, 32767 / 32768, 1];

test("compressed waveform retains exact PCM16 peaks through project save/reopen", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "raccoon-waveform-"));
  try {
    const waveform = await saveWaveform(peaks, source, 8);
    const file = path.join(dir, "saved.captionproj");
    const p = {
      ...blank(),
      media: { path: source.path, duration: source.duration, fps: 30 },
      waveform,
    };
    await writeProject(file, p);
    const reopened = await readProject(file);
    assert.deepEqual(reopened, p);
    assert.deepEqual(
      (await restoreWaveform(reopened.waveform, source))?.peaks,
      peaks,
    );
    assert.equal(waveformMatchesMedia(waveform, reopened.media), true);
    assert.equal(
      waveformMatchesMedia(waveform, {
        ...reopened.media!,
        path: "different.mp4",
      }),
      false,
    );
    assert.equal(waveformMatchesMedia(waveform, null), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("waveform reuse rejects changed media path, size, modification time and duration", async () => {
  const waveform = await saveWaveform(peaks, source, 8);
  for (const changed of [
    { ...source, path: "other.mp4" },
    { ...source, size: source.size + 1 },
    { ...source, modifiedAtMs: source.modifiedAtMs + 1 },
    { ...source, duration: source.duration + 1 },
  ])
    assert.equal(await restoreWaveform(waveform, changed), null);
  const dir = await mkdtemp(path.join(tmpdir(), "raccoon-waveform-media-"));
  try {
    const file = path.join(dir, "video.mp4");
    await writeFile(file, "first");
    const original = await waveformSource(file, 10);
    const cached = await saveWaveform(peaks, original, 8);
    await writeFile(file, "other"); // Same file name and size, different mtime.
    await utimes(
      file,
      new Date(original.modifiedAtMs + 2000),
      new Date(original.modifiedAtMs + 2000),
    );
    assert.equal(
      await restoreWaveform(cached, await waveformSource(file, 10)),
      null,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("legacy projects open without a waveform and malformed caches are discarded", async () => {
  const legacy = blank();
  assert.deepEqual(ProjectSchema.parse(legacy), legacy);
  const malformed = ProjectSchema.parse({
    ...legacy,
    waveform: { version: 99 },
  });
  assert.equal(malformed.waveform, undefined);
  assert.equal(await restoreWaveform(undefined, source), null);
  const valid = await saveWaveform(peaks, source, 8);
  assert.equal(
    await restoreWaveform({ ...valid, data: "not compressed data" }, source),
    null,
  );
});

test("corrupt waveform counts and oversized decompression fall back safely", async () => {
  const valid = await saveWaveform(peaks, source, 8);
  assert.equal(
    await restoreWaveform({ ...valid, peakCount: peaks.length - 1 }, source),
    null,
  );
  assert.equal(
    await restoreWaveform({ ...valid, peakCount: peaks.length + 1 }, source),
    null,
  );
  assert.equal(
    await restoreWaveform(
      { ...valid, peakCount: MAX_WAVEFORM_PEAKS + 1 },
      source,
    ),
    null,
  );
  const invalidAmplitude = Buffer.from([255, 255]);
  assert.equal(
    await restoreWaveform(
      {
        ...valid,
        peakCount: 1,
        data: deflateSync(invalidAmplitude).toString("base64"),
      },
      source,
    ),
    null,
  );
  await assert.rejects(saveWaveform([NaN], source, 8), /Invalid waveform/);
});
