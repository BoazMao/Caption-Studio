import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  toolDefaults,
  restoreTool,
  persistTool,
  toolSpecs,
  type ToolKey,
} from "../src/main/tools";

test("bundled tools survive extraction moves while custom executables are preserved", () => {
  const first = toolDefaults("old/resources", "source", () => true);
  const moved = toolDefaults("new/resources", "source", () => true);
  for (const key of Object.keys(toolSpecs) as ToolKey[]) {
    const saved = persistTool(key, first[key], first[key]);
    assert.equal(restoreTool(key, saved, moved[key]), moved[key]);
    assert.equal(
      restoreTool(key, toolSpecs[key].command, moved[key]),
      moved[key],
    );
    assert.equal(restoreTool(key, undefined, moved[key]), moved[key]);
    assert.equal(
      restoreTool(key, "custom/tool.exe", moved[key]),
      "custom/tool.exe",
    );
    assert.equal(
      persistTool(key, "custom/tool.exe", first[key]),
      "custom/tool.exe",
    );
  }
});

test("development tools resolve locally and unprepared tools fall back to PATH", () => {
  const tools = toolDefaults("resources", "source", (file) =>
    file.includes("bundled-tools"),
  );
  assert.equal(
    tools.ytdlp,
    path.join("source", ".tools/bundled-tools/yt-dlp.exe"),
  );
  assert.equal(
    tools.whisper,
    path.join("source", ".tools/bundled-tools/whisper/whisper-cli.exe"),
  );
  assert.equal(tools.ffmpeg, "ffmpeg");
});
