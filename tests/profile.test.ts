import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrateProfile } from "../src/main/profile";

test("profile migration preserves existing settings and copies recovery only once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "raccoon-profile-"));
  const legacy = path.join(root, "legacy"),
    current = path.join(root, "current");
  try {
    await mkdir(path.join(legacy, "recovery"), { recursive: true });
    await mkdir(current);
    await writeFile(path.join(legacy, "settings.json"), "legacy settings");
    await writeFile(path.join(current, "settings.json"), "current settings");
    await writeFile(
      path.join(legacy, "recovery.captionproj"),
      "legacy session",
    );
    await writeFile(
      path.join(legacy, "recovery", "project.captionproj"),
      "saved recovery",
    );
    await migrateProfile(legacy, current);
    assert.equal(
      await readFile(path.join(current, "settings.json"), "utf8"),
      "current settings",
    );
    assert.equal(
      await readFile(path.join(current, "recovery.captionproj"), "utf8"),
      "legacy session",
    );
    assert.equal(
      await readFile(
        path.join(current, "recovery", "project.captionproj"),
        "utf8",
      ),
      "saved recovery",
    );
    await writeFile(path.join(current, "recovery.captionproj"), "new session");
    await migrateProfile(legacy, current);
    assert.equal(
      await readFile(path.join(current, "recovery.captionproj"), "utf8"),
      "new session",
    );
    assert.equal(
      await readFile(path.join(legacy, "recovery.captionproj"), "utf8"),
      "legacy session",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fresh install without a legacy profile starts normally", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "raccoon-profile-"));
  try {
    const current = path.join(root, "current");
    await migrateProfile(path.join(root, "absent"), current);
    assert.equal(
      JSON.parse(
        await readFile(path.join(current, "profile-migrated.json"), "utf8"),
      ).from,
      "caption-studio",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
