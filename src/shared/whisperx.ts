import { z } from "zod";
import { CaptionSchema, type Caption } from "./model";

const Unit = z.object({
  text: z.string(),
  start: z.number().finite().nullable(),
  end: z.number().finite().nullable(),
  confidence: z.number().finite().nullable(),
});
export const WhisperXResult = z.object({
  version: z.literal(1),
  language: z.enum(["en", "zh"]),
  segments: z.array(
    z.object({
      id: z.string().nullable().optional(),
      start: z.number().finite().nonnegative(),
      end: z.number().finite().nonnegative(),
      text: z.string(),
      units: z.array(Unit),
    }),
  ),
});

export function importWhisperX(
  input: unknown,
  duration: number,
  originals?: Caption[],
): Caption[] {
  const result = WhisperXResult.parse(input);
  const output: Caption[] = [];
  for (const segment of result.segments) {
    const original = originals?.find((c) => c.id === segment.id);
    if (originals && !original)
      throw Error("Alignment returned an unknown caption ID");
    if (!segment.text.trim()) continue;
    const timed = segment.units.filter(
      (u) =>
        u.start !== null &&
        u.end !== null &&
        u.start >= 0 &&
        u.end >= u.start &&
        u.end <= duration,
    );
    const missing = segment.units
      .filter((u) => !timed.includes(u))
      .map((u) => u.text);
    const complete =
      timed.length > 0 &&
      missing.length === 0 &&
      segment.units
        .map((u) => u.text)
        .join("")
        .replace(/\s/g, "") === segment.text.replace(/\s/g, "");
    const groups: (typeof timed)[] = [];
    if (original || !complete) groups.push(timed);
    else {
      let group: typeof timed = [];
      for (const u of timed) {
        if (
          group.length &&
          (u.start! - group.at(-1)!.end! >= 0.65 ||
            u.end! - group[0].start! > 6 ||
            group.map((t) => t.text).join("").length >=
              (result.language === "zh" ? 28 : 70))
        ) {
          groups.push(group);
          group = [];
        }
        group.push(u);
      }
      if (group.length) groups.push(group);
    }
    for (const group of groups) {
      const uncertain =
        !complete ||
        group.some(
          (u, i) =>
            (u.confidence ?? 0) < 0.35 ||
            (i > 0 && u.start! < group[i - 1].start!),
        );
      const start = complete
        ? Math.max(0, group[0].start! - 0.05)
        : (original?.start ?? segment.start);
      const end = complete
        ? Math.min(duration, Math.max(start + 0.04, group.at(-1)!.end! + 0.12))
        : Math.min(duration, original?.end ?? segment.end);
      output.push(
        CaptionSchema.parse({
          ...(original || {
            id: crypto.randomUUID(),
            target: "",
            status: "empty",
          }),
          start,
          end,
          source:
            original?.source ??
            (!complete
              ? segment.text.trim()
              : group
                  .map((u) => u.text)
                  .join(result.language === "zh" ? "" : " ")),
          alignment: {
            method: "whisperx",
            needsReview: uncertain,
            missingWords: missing.length
              ? missing
              : !complete
                ? ["Alignment incomplete"]
                : [],
            tokens: group.map((u, i) => ({
              text: (i && result.language === "en" ? " " : "") + u.text,
              start: u.start!,
              end: u.end!,
              confidence: Math.max(0, Math.min(1, u.confidence ?? 0)),
            })),
          },
        }),
      );
    }
  }
  if (
    originals &&
    (output.length !== originals.length ||
      new Set(output.map((c) => c.id)).size !== originals.length)
  )
    throw Error("Alignment did not return every selected caption");
  return output;
}

export function applyRealignment(
  current: Caption[],
  originals: Caption[],
  aligned: Caption[],
): Caption[] {
  return current.map((c) => {
    const before = originals.find((x) => x.id === c.id),
      after = aligned.find((x) => x.id === c.id);
    if (
      !before ||
      !after ||
      c.source !== before.source ||
      c.start !== before.start ||
      c.end !== before.end
    )
      return c;
    return {
      ...c,
      start: after.start,
      end: after.end,
      alignment: after.alignment,
    };
  });
}
