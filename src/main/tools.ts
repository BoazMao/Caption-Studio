import path from "node:path";

export const toolSpecs = {
  ffmpeg: {
    command: "ffmpeg",
    marker: "$BUNDLED_FFMPEG",
    resource: "ffmpeg.exe",
    development: "node_modules/ffmpeg-static/ffmpeg.exe",
  },
  ffprobe: {
    command: "ffprobe",
    marker: "$BUNDLED_FFPROBE",
    resource: "ffprobe.exe",
    development: "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe",
  },
  ytdlp: {
    command: "yt-dlp",
    marker: "$BUNDLED_YTDLP",
    resource: "yt-dlp.exe",
    development: ".tools/bundled-tools/yt-dlp.exe",
  },
  whisper: {
    command: "whisper-cli",
    marker: "$BUNDLED_WHISPER",
    resource: "whisper/whisper-cli.exe",
    development: ".tools/bundled-tools/whisper/whisper-cli.exe",
  },
} as const;
export type ToolKey = keyof typeof toolSpecs;

export function toolDefaults(
  resources: string,
  root: string,
  exists: (file: string) => boolean,
) {
  return Object.fromEntries(
    Object.entries(toolSpecs).map(([key, spec]) => {
      const bundled = path.join(resources, "tools", spec.resource);
      const development = path.join(root, spec.development);
      return [
        key,
        exists(bundled)
          ? bundled
          : exists(development)
            ? development
            : spec.command,
      ];
    }),
  ) as Record<ToolKey, string>;
}

export function restoreTool(key: ToolKey, saved: unknown, fallback: string) {
  const spec = toolSpecs[key];
  return typeof saved !== "string" ||
    !saved ||
    saved === spec.command ||
    saved === spec.marker
    ? fallback
    : saved;
}

export function persistTool(key: ToolKey, value: string, fallback: string) {
  return path.normalize(value).toLowerCase() ===
    path.normalize(fallback).toLowerCase()
    ? toolSpecs[key].marker
    : value;
}
