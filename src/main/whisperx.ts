import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Caption, Project, SpeechRun } from "../shared/model";
import type { Settings } from "../shared/ipc";
import { importWhisperX } from "../shared/whisperx";
import { run } from "./jobs";

export async function whisperXJob(
  p: Project | null,
  config: Settings,
  dir: string,
  worker: string,
  signal: AbortSignal,
  update: (n: number, message: string) => void,
  originals?: Caption[],
) {
  const audio = path.join(dir, "speech.wav"),
    output = path.join(dir, "aligned.json"),
    request = path.join(dir, "request.json");
  if (p?.media) {
    update(1, "Preparing audio");
    await run(
      config.ffmpeg,
      [
        "-y",
        "-v",
        "error",
        "-i",
        p.media.path,
        "-vn",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        audio,
      ],
      signal,
    );
  }
  await writeFile(
    request,
    JSON.stringify({
      audio,
      output,
      model: config.whisperxModel,
      language: p?.language || "en",
      device: config.whisperxDevice,
      cache: config.whisperxCache,
      offline: config.whisperxOffline,
      check: !p,
      captions: originals,
    }),
    "utf8",
  );
  let pending = "";
  const lines = (text: string) => {
    pending += text;
    const parts = pending.split(/\r?\n/);
    pending = parts.pop() || "";
    for (const line of parts)
      if (line.startsWith("STUDIO:")) {
        try {
          const e = JSON.parse(line.slice(7));
          if (typeof e.progress === "number" && typeof e.message === "string")
            update(Math.min(100, Math.max(0, e.progress)), e.message);
        } catch {
          /* Other Python output is diagnostic only. */
        }
      }
  };
  await run(
    config.whisperxPython,
    ["-u", worker, request],
    signal,
    () => {},
    (data) => lines(data.toString("utf8")),
  );
  signal.throwIfAborted();
  if (!p) return { captions: [], speechRun: undefined };
  const result = JSON.parse(await readFile(output, "utf8"));
  let captions: Caption[] = [],
    importError: string | undefined;
  try {
    captions = importWhisperX(
      result,
      p.media!.duration,
      originals,
      originals ? p.captions : [],
    );
  } catch (error) {
    importError = error instanceof Error ? error.message : String(error);
  }
  const speechRun: SpeechRun = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    mode: originals ? "realignment" : "transcription",
    raw: result.raw ?? result,
    importError,
    captions: structuredClone(captions),
  };
  return { captions, speechRun };
}
