import { z } from "zod";
export const CaptionSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
    source: z.string(),
    target: z.string(),
    status: z.enum(["empty", "draft", "reviewed", "stale", "failed"]),
    error: z.string().optional(),
  })
  .refine((c) => c.end > c.start, "Caption end must follow start");
export const ProjectSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    name: z.string(),
    media: z
      .object({
        path: z.string(),
        previewPath: z.string().optional(),
        duration: z.number().finite().nonnegative(),
        fps: z.number().finite().positive(),
      })
      .nullable(),
    language: z.string(),
    targetLanguage: z.string(),
    captions: z.array(CaptionSchema),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.captions.map((c) => c.id)).size !== p.captions.length)
      ctx.addIssue({ code: "custom", message: "Duplicate caption IDs" });
  });
export type Caption = z.infer<typeof CaptionSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export const blank = (): Project => ({
  version: 1,
  id: crypto.randomUUID(),
  name: "Untitled project",
  media: null,
  language: "en",
  targetLanguage: "Chinese",
  captions: [],
});
export function sourceEdit(c: Caption, source: string): Caption {
  return {
    ...c,
    source,
    status: source === c.source ? c.status : c.target ? "stale" : "empty",
    error: undefined,
  };
}
export function timing(
  c: Caption,
  start: number,
  end: number,
  duration = Infinity,
): Caption {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end - start < 0.04 ||
    end > duration + 0.001
  )
    throw Error("Timing must be within the video and at least 40 ms long");
  return { ...c, start, end };
}
export function split(c: Caption, at: number, id: string): Caption[] {
  if (at - c.start < 0.04 || c.end - at < 0.04)
    throw Error("Place the playhead inside the caption");
  const words = c.source.split(" "),
    cut = Math.max(
      1,
      Math.round((words.length * (at - c.start)) / (c.end - c.start)),
    );
  return [
    {
      ...c,
      end: at,
      source: words.slice(0, cut).join(" "),
      target: "",
      status: "empty",
    },
    {
      ...c,
      id,
      start: at,
      source: words.slice(cut).join(" "),
      target: "",
      status: "empty",
    },
  ];
}
export function merge(a: Caption, b: Caption): Caption {
  return {
    ...a,
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
    source: [a.source, b.source].filter(Boolean).join(" "),
    target: [a.target, b.target].filter(Boolean).join(" "),
    status: a.target || b.target ? "stale" : "empty",
  };
}
export function translated(
  c: Caption,
  original: string,
  text: string,
  error?: string,
  originalTarget?: string,
): Caption {
  // A response must not replace a manual edit made while it was in flight.
  if (originalTarget !== undefined && c.target !== originalTarget) return c;
  if (c.source !== original)
    return { ...c, status: c.target ? "stale" : "empty" };
  return {
    ...c,
    target: error ? c.target : text,
    status: error ? "failed" : "draft",
    error,
  };
}
export function stamp(s: number) {
  const n = Math.round(s * 1000);
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
}
export function srt(p: Project, track: "source" | "target") {
  ProjectSchema.parse(p);
  return [...p.captions]
    .sort((a, b) => a.start - b.start)
    .filter((c) => c[track].trim())
    .map(
      (c, i) =>
        `${i + 1}\r\n${stamp(c.start)} --> ${stamp(c.end)}\r\n${c[track].trim()}\r\n`,
    )
    .join("\r\n");
}
export function parseSrt(text: string): Caption[] {
  return text
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.split("\n"),
        i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) return [];
      const time = (s: string) => {
        const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
        if (!m) throw Error("Invalid subtitle timestamp");
        return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
      };
      const [a, b] = lines[i].split("-->");
      return [
        CaptionSchema.parse({
          id: crypto.randomUUID(),
          start: time(a),
          end: time(b),
          source: lines
            .slice(i + 1)
            .join("\n")
            .trim(),
          target: "",
          status: "empty",
        }),
      ];
    });
}
