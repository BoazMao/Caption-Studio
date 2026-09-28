import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  blank,
  timing,
  split,
  merge,
  sourceEdit,
  translated,
  srt,
  parseSrt,
  ProjectSchema,
  type Caption,
} from "../src/shared/model";
import { writeProject, readProject } from "../src/main/storage";
import { run, Jobs } from "../src/main/jobs";
const c: Caption = {
  id: "stable",
  start: 1,
  end: 4,
  source: "Hello world",
  target: "Hola mundo",
  status: "reviewed",
};
test("project roundtrip preserves media, IDs, review and Unicode; concurrent saves are ordered", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caption-test-"));
  try {
    const p = {
      ...blank(),
      media: { path: "C:\\Video & files\\测试.mp4", duration: 12, fps: 29.97 },
      captions: [c],
    };
    const file = path.join(dir, "project.captionproj");
    await Promise.all([
      writeProject(file, p),
      writeProject(file, { ...p, name: "Newest" }),
    ]);
    assert.deepEqual(await readProject(file), { ...p, name: "Newest" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("reject malformed timing and duplicate IDs", () => {
  assert.throws(() => ProjectSchema.parse({ ...blank(), captions: [c, c] }));
  assert.throws(() => timing(c, -1, 4));
  assert.throws(() => timing(c, 4, 2));
  assert.throws(() => timing(c, 1, 20, 10));
  assert.equal(timing(c, 2, 5).id, "stable");
});
test("split partitions text, preserves first ID and clears ambiguous translations", () => {
  const pair = split(c, 2.5, "new");
  assert.equal(pair[0].id, "stable");
  assert.equal(pair[1].id, "new");
  assert.equal(pair[0].end, pair[1].start);
  assert.equal(pair.map((x) => x.source).join(" "), c.source);
  assert.equal(pair[0].target, "");
  assert.throws(() => split(c, 1, "x"));
});
test("merge spans timing, joins text, invalidates translations", () => {
  const m = merge(c, { ...c, id: "next", start: 5, end: 7, source: "Again" });
  assert.equal(m.end, 7);
  assert.equal(m.id, c.id);
  assert.equal(m.source, "Hello world Again");
  assert.equal(m.status, "stale");
});
test("source edit and out-of-order translation cannot silently become reviewed", () => {
  const changed = sourceEdit(c, "Goodbye");
  assert.equal(changed.status, "stale");
  assert.equal(
    translated(changed, "Hello world", "Old response").target,
    "Hola mundo",
  );
  assert.equal(translated(c, c.source, "Hola").status, "draft");
  assert.equal(translated(c, c.source, "", "Network error").status, "failed");
  assert.equal(sourceEdit(c, c.source).status, "reviewed");
  assert.equal(
    translated(
      { ...c, target: "Manual edit" },
      c.source,
      "AI result",
      undefined,
      c.target,
    ).target,
    "Manual edit",
  );
});
test("SRT sorts, rounds milliseconds, separates tracks and preserves multiline Unicode", () => {
  const p = {
    ...blank(),
    captions: [
      { ...c, id: "2", start: 61.9996, end: 64, source: "Second\n字幕" },
      c,
    ],
  };
  const source = srt(p, "source");
  assert.match(source, /1\r\n00:00:01,000 --> 00:00:04,000/);
  assert.match(source, /00:01:02,000/);
  assert.match(source, /Second\n字幕/);
  assert.ok(!srt(p, "target").includes("Hello"));
  assert.equal(parseSrt(source).length, 2);
});
test("argument arrays preserve metacharacters without a shell", async () => {
  const result = await run(
    process.execPath,
    ["-e", "process.stdout.write(process.argv[1])", "literal & | $(secret)"],
    new AbortController().signal,
  );
  assert.equal(result, "literal & | $(secret)");
});
test("background job cancellation terminates a real child and reports cancelled", async () => {
  const events: any[] = [];
  const jobs = new Jobs((e) => events.push(e));
  const id = jobs.start("test", async (signal) => {
    await run(process.execPath, ["-e", "setInterval(()=>{},1000)"], signal);
  });
  await new Promise((r) => setTimeout(r, 200));
  jobs.cancel(id);
  for (let i = 0; i < 100 && jobs.active.size; i++)
    await new Promise((r) => setTimeout(r, 30));
  assert.equal(jobs.active.size, 0);
  assert.equal(events.at(-1).job.state, "cancelled");
});
