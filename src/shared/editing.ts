import { z } from "zod";
import { CaptionSchema, type Caption } from "./model";

export const ClipboardSchema = z.object({
  format: z.enum(["raccoon-studio/1", "caption-studio/1"]),
  targetLanguage: z.string(),
  captions: z.array(CaptionSchema).min(1).max(10000),
});

export function pasteCaptions(
  text: string,
  at: number,
  duration: number,
  targetLanguage: string,
): Caption[] {
  const data = ClipboardSchema.parse(JSON.parse(text));
  const offset = at - Math.min(...data.captions.map((c) => c.start));
  if (
    !Number.isFinite(at) ||
    at < 0 ||
    data.captions.some((c) => c.end + offset > duration + 0.000001)
  )
    throw Error(
      "Copied captions do not fit after the playhead. Seek earlier and paste again.",
    );
  return data.captions.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
    start: c.start + offset,
    end: c.end + offset,
    status:
      c.target && data.targetLanguage !== targetLanguage ? "stale" : c.status,
    alignment: c.alignment
      ? {
          ...c.alignment,
          needsReview: true,
          tokens: c.alignment.tokens.map((t) => ({
            ...t,
            start: Math.max(0, t.start + offset),
            end: Math.max(0, t.end + offset),
          })),
        }
      : undefined,
  }));
}

export function overlappingCaptions(captions: Caption[]): Map<string, string> {
  const warnings = new Map<string, string>();
  const ordered = [...captions].sort((a, b) => a.start - b.start);
  let furthest: Caption | undefined;
  for (const c of ordered) {
    if (furthest && c.start < furthest.end) {
      const message = `Overlap ${c.start.toFixed(3)}–${Math.min(c.end, furthest.end).toFixed(3)} s`;
      warnings.set(c.id, message);
      warnings.set(furthest.id, message);
    }
    if (!furthest || c.end > furthest.end) furthest = c;
  }
  return warnings;
}
