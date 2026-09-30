import { access, cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

// Copy only session/settings data. Existing media/model cache paths remain valid,
// avoiding a multi-gigabyte cache copy or changes to the user's old profile.
export async function migrateProfile(legacy: string, current: string) {
  const marker = path.join(current, "profile-migrated.json");
  if (path.resolve(legacy) === path.resolve(current) || (await exists(marker)))
    return;
  await mkdir(current, { recursive: true });
  for (const name of ["settings.json", "recovery.captionproj", "recovery"]) {
    const source = path.join(legacy, name),
      target = path.join(current, name);
    if (await exists(source))
      await cp(source, target, { recursive: true, force: false });
  }
  await writeFile(
    marker,
    JSON.stringify({
      from: "caption-studio",
      completedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}
