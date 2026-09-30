import { test } from "node:test";
import assert from "node:assert/strict";
import { importWhisperX, applyRealignment } from "../src/shared/whisperx";
import { blank, CaptionSchema, type Caption } from "../src/shared/model";
import { readProject, writeProject } from "../src/main/storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const old: Caption = {
  id: "stable",
  start: 1,
  end: 4,
  source: "Hello world",
  target: "你好世界",
  status: "reviewed",
};
const result = {
  version: 1,
  language: "en",
  segments: [
    {
      id: "stable",
      start: 1,
      end: 4,
      text: "Hello world",
      units: [
        { text: "Hello", start: 1.2, end: 1.8, confidence: 0.9 },
        { text: "world", start: 2, end: 2.6, confidence: 0.9 },
      ],
    },
  ],
};
test("WhisperX aligns words and preserves IDs, translations and review on realignment", async () => {
  const aligned = importWhisperX(result, 10, [old]);
  assert.equal(aligned[0].id, old.id);
  assert.equal(aligned[0].target, old.target);
  assert.equal(aligned[0].status, "reviewed");
  assert.equal(aligned[0].alignment?.method, "whisperx");
  assert.ok(aligned[0].start > old.start && aligned[0].end < old.end);
  assert.equal(
    applyRealignment(
      [{ ...old, source: "Edited during job" }],
      [old],
      aligned,
    )[0].start,
    old.start,
  );
  assert.equal(
    applyRealignment([{ ...old, target: "Manual target" }], [old], aligned)[0]
      .target,
    "Manual target",
  );
  const dir = await mkdtemp(path.join(tmpdir(), "whisperx-project-"));
  try {
    const file = path.join(dir, "test.captionproj");
    await writeProject(file, { ...blank(), captions: aligned });
    assert.deepEqual((await readProject(file)).captions, aligned);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("missing word timestamps retain source and flag review without fabricated word times", () => {
  const data = structuredClone(result);
  data.segments[0].units[1].start = null as any;
  const c = importWhisperX(data, 10)[0];
  assert.equal(c.source, "Hello world");
  assert.equal(c.alignment?.needsReview, true);
  assert.deepEqual(c.alignment?.missingWords, ["world"]);
  assert.equal(c.alignment?.tokens.length, 1);
  assert.throws(
    () => importWhisperX({ ...result, segments: [] }, 10, [old]),
    /every selected/,
  );
  assert.equal(
    CaptionSchema.parse({
      ...old,
      alignment: { method: "whisper-dtw", needsReview: false, tokens: [] },
    }).id,
    old.id,
  );
});
test("Chinese alignment retains characters without adding spaces", () => {
  const c = importWhisperX(
    {
      version: 1,
      language: "zh",
      segments: [
        {
          start: 0,
          end: 2,
          text: "你好",
          units: [
            { text: "你", start: 0.2, end: 0.6, confidence: 0.9 },
            { text: "好", start: 0.7, end: 1, confidence: 0.9 },
          ],
        },
      ],
    },
    3,
  )[0];
  assert.equal(c.source, "你好");
  assert.equal(c.alignment?.tokens.length, 2);
  assert.equal(c.alignment?.needsReview, false);
});
