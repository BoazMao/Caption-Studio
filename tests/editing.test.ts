import { test } from "node:test";
import assert from "node:assert/strict";
import { pasteCaptions, overlappingCaptions } from "../src/shared/editing";
import type { Caption } from "../src/shared/model";
const caption = (id: string, start: number, end: number): Caption => ({
  id,
  start,
  end,
  source: id,
  target: "译文",
  status: "reviewed",
});
test("clipboard paste preserves relative timing and tracks, with fresh IDs", () => {
  const originals = [caption("a", 2, 3), caption("b", 4, 6)];
  const text = JSON.stringify({
    format: "raccoon-studio/1",
    targetLanguage: "Chinese",
    captions: originals,
  });
  const result = pasteCaptions(text, 10, 20, "Chinese");
  assert.equal(
    pasteCaptions(
      text.replace("raccoon-studio/1", "caption-studio/1"),
      10,
      20,
      "Chinese",
    ).length,
    2,
  );
  assert.deepEqual(
    result.map((c) => [c.start, c.end, c.target, c.status]),
    [
      [10, 11, "译文", "reviewed"],
      [12, 14, "译文", "reviewed"],
    ],
  );
  assert.equal(new Set([...originals, ...result].map((c) => c.id)).size, 4);
  assert.equal(pasteCaptions(text, 0, 20, "English")[0].status, "stale");
  assert.throws(() => pasteCaptions(text, 18, 20, "Chinese"), /do not fit/);
  assert.throws(() => pasteCaptions("plain text", 0, 20, "Chinese"));
});
test("overlaps flag every participating caption including nested and equal-start cues", () => {
  const result = overlappingCaptions([
    caption("outer", 0, 10),
    caption("inner", 1, 2),
    caption("inner2", 1, 3),
    caption("later", 4, 5),
    caption("touching", 10, 11),
  ]);
  assert.deepEqual([...result.keys()].sort(), [
    "inner",
    "inner2",
    "later",
    "outer",
  ]);
  assert.match(result.get("later")!, /4.000–5.000/);
  assert.equal(overlappingCaptions([caption("only", 0, 1)]).size, 0);
});
