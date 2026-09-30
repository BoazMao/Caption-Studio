import { test } from "node:test";
import assert from "node:assert/strict";
import {
  importWhisperX,
  applyRealignment,
  applyTranscription,
} from "../src/shared/whisperx";
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

const sentence = (text: string, start: number | null, end: number | null) => ({
  text,
  start,
  end,
  window: { start: 0, end: 20 },
  units: [{ text, start, end, confidence: 0.95 }],
});
test("WhisperX sentence blocks retain exact text despite old length, duration and pause thresholds", () => {
  const text =
    'Dr. Smith said, "This is a very long sentence that must remain intact even when it lasts longer than six seconds."';
  const data = {
    version: 2,
    language: "en",
    segments: [sentence(text, 1, 10), sentence("Next sentence.", 11, 12)],
  };
  const captions = importWhisperX(data, 20);
  assert.equal(captions.length, 2);
  assert.equal(captions[0].source, text);
  assert.equal(captions[0].start, 0.95);
  assert.equal(captions[0].end, 10.05);
});
test("50 ms padding shares short gaps, clips to media edges and preserves real overlaps", () => {
  const make = (segments: ReturnType<typeof sentence>[]) =>
    importWhisperX({ version: 2, language: "en", segments }, 20);
  const adjacent = make([
    sentence("One.", 0, 1),
    sentence("Two.", 1.06, 2),
    sentence("End.", 19, 20),
  ]);
  assert.equal(adjacent[0].start, 0);
  assert.equal(adjacent[0].end, 1.03);
  assert.equal(adjacent[1].start, 1.03);
  assert.equal(adjacent[2].end, 20);
  const touching = make([sentence("One.", 0, 1), sentence("Two.", 1, 2)]);
  assert.equal(touching[0].end, 1);
  assert.equal(touching[1].start, 1);
  const overlapping = make([sentence("One.", 1, 2), sentence("Two.", 1.9, 3)]);
  assert.equal(overlapping[0].end, 2.05);
  assert.ok(overlapping[1].start < 1.9);
});
test("untimed sentence remains explicitly flagged and never receives invented word times", () => {
  const c = importWhisperX(
    {
      version: 2,
      language: "en",
      segments: [sentence("Unaligned text.", null, null)],
    },
    20,
  )[0];
  assert.equal(c.source, "Unaligned text.");
  assert.equal(c.alignment?.needsReview, true);
  assert.deepEqual(c.alignment?.tokens, []);
});
test("complete WhisperX archives survive save/reopen and caption edits independently", async () => {
  const raw = {
    transcription: {
      language: "en",
      segments: [
        {
          text: "Hi.",
          start: 1,
          end: 2,
          avg_logprob: -0.1,
          extra: { nested: [null, 0.9] },
        },
      ],
    },
    alignments: [
      {
        output: {
          segments: [
            {
              text: "Hi.",
              chars: [{ char: "H", start: 1, end: 1.2, score: 0.8 }],
            },
          ],
          word_segments: [{ word: "Hi.", start: 1, end: 2, score: 0.8 }],
        },
      },
    ],
  };
  const captions = importWhisperX(
    { version: 2, language: "en", segments: [sentence("Hi.", 1, 2)] },
    20,
  );
  const run = {
    id: "run",
    createdAt: "2026-09-30",
    mode: "transcription" as const,
    raw,
    captions: structuredClone(captions),
  };
  const original = { ...blank(), captions: [old] };
  const replaced = applyTranscription(
    original,
    captions,
    "replace",
    [old],
    run,
  );
  assert.equal(replaced.blocked, false);
  assert.equal(replaced.project.captions.length, 1);
  replaced.project.captions[0] = {
    ...replaced.project.captions[0],
    source: "Edited",
  };
  assert.equal(run.captions[0].source, "Hi.");
  const added = applyTranscription(original, captions, "add", [old], run);
  assert.equal(added.project.captions.length, 2);
  const raced = applyTranscription(
    { ...original, captions: [{ ...old, target: "Manual edit" }] },
    captions,
    "replace",
    [old],
    run,
  );
  assert.equal(raced.blocked, true);
  assert.equal(raced.project.captions[0].target, "Manual edit");
  assert.deepEqual(raced.project.speechRuns?.[0].raw, raw);
  const dir = await mkdtemp(path.join(tmpdir(), "speech-archive-"));
  try {
    const file = path.join(dir, "project.captionproj");
    await writeProject(file, replaced.project);
    assert.deepEqual((await readProject(file)).speechRuns, [run]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("replacement compares caption values across persistence key ordering and protects import failures", () => {
  const reordered = {
    source: old.source,
    status: old.status,
    id: old.id,
    target: old.target,
    end: old.end,
    start: old.start,
  };
  const p = { ...blank(), captions: [old] };
  assert.equal(
    applyTranscription(p, [], "replace", [reordered]).blocked,
    false,
  );
  const run = {
    id: "bad-run",
    createdAt: "2026-09-30",
    mode: "transcription" as const,
    raw: { segments: [] },
    captions: [],
    importError: "Missing timing",
  };
  const result = applyTranscription(p, [], "replace", [old], run);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.project.captions, [old]);
  assert.equal(result.project.speechRuns?.[0].importError, "Missing timing");
});
