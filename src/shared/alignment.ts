import { z } from "zod";
import { CaptionSchema, type Caption } from "./model";

const TokenSchema = z.object({
  text: z.string(),
  offsets: z.object({ from: z.number(), to: z.number() }),
  t_dtw: z.number(),
  p: z.number(),
});
const OutputSchema = z.object({
  transcription: z.array(
    z.object({ text: z.string(), tokens: z.array(TokenSchema) }),
  ),
});
type TimedToken = NonNullable<Caption["alignment"]>["tokens"][number];
const isSpecial = (text: string) => /^\[_.*\]$/.test(text);
const textOf = (tokens: TimedToken[]) =>
  tokens.map((token) => token.text).join("").trim();

export function captionsFromWhisperJson(input: unknown, duration: number): Caption[] {
  const output = OutputSchema.parse(input);
  const groups: TimedToken[][] = [];
  for (const segment of output.transcription) {
    let current: TimedToken[] = [];
    for (const token of segment.tokens) {
      if (isSpecial(token.text) || !token.text.trim()) continue;
      const start = token.offsets.from / 1000;
      const end = token.offsets.to / 1000;
      if (
        token.t_dtw < 0 ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        end > duration + 0.5
      )
        throw Error("Whisper did not produce complete audio-aligned timestamps");
      const next = {
        text: token.text,
        start,
        end,
        confidence: Math.max(0, Math.min(1, token.p)),
      };
      const previous = current.at(-1);
      if (
        previous &&
        (start - previous.end >= 0.65 ||
          (end - current[0].start > 6 && textOf(current).length >= 25) ||
          (textOf(current).length >= 70 && /^\s/.test(token.text)))
      ) {
        groups.push(current);
        current = [];
      }
      current.push(next);
    }
    if (current.length) groups.push(current);
  }
  if (!groups.length) throw Error("Whisper returned no aligned speech");
  return groups.map((tokens, i) => {
    const nextStart = groups[i + 1]?.[0].start;
    const lastEnd = tokens.at(-1)!.end;
    const start = Math.max(0, tokens[0].start - 0.05);
    let end = Math.min(duration, lastEnd + 0.25);
    if (nextStart !== undefined && nextStart > lastEnd + 0.08)
      end = Math.min(end, nextStart - 0.04);
    end = Math.max(start + 0.04, end);
    const caption = {
      id: crypto.randomUUID(),
      start,
      end,
      source: textOf(tokens),
      target: "",
      status: "empty" as const,
      alignment: {
        method: "whisper-dtw" as const,
        needsReview:
          tokens.some((token) => token.confidence < 0.35) ||
          tokens.some((token, j) =>
            j ? token.start + 0.12 < tokens[j - 1].start : false,
          ),
        tokens,
      },
    };
    return CaptionSchema.parse(caption);
  });
}

export function dtwPreset(modelPath: string): string {
  const name = modelPath.split(/[\\/]/).pop()?.toLowerCase() || "";
  const match = name.match(
    /^ggml-(tiny(?:\.en)?|base(?:\.en)?|small(?:\.en)?|medium(?:\.en)?|large-v[123](?:-turbo)?)(?:-[^.]+)?\.bin$/,
  );
  if (!match)
    throw Error(
      "Automatic alignment needs a standard Whisper GGML model filename such as ggml-medium.bin",
    );
  return match[1].replace(/-/g, ".");
}
