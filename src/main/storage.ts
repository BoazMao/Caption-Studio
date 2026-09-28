import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { ProjectSchema, type Project } from "../shared/model";
export async function readProject(file: string) {
  return ProjectSchema.parse(JSON.parse(await readFile(file, "utf8")));
}
const pending = new Map<string, Promise<void>>();
export function writeProject(file: string, project: Project) {
  const valid = ProjectSchema.parse(project);
  const next = (pending.get(file) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const temp = file + ".tmp";
      await writeFile(temp, JSON.stringify(valid, null, 2), "utf8");
      await rename(temp, file);
    });
  pending.set(file, next);
  void next
    .finally(() => {
      if (pending.get(file) === next) pending.delete(file);
    })
    .catch(() => {});
  return next;
}
