import { z } from "zod";

export const WAVEFORM_SAMPLE_RATE = 8000;
export const MAX_WAVEFORM_PEAKS = 2_000_000;

export const WaveformSchema = z.object({
  version: z.literal(1),
  encoding: z.literal("deflate-u16le"),
  source: z.object({
    path: z.string().min(1),
    size: z.number().int().nonnegative().safe(),
    modifiedAtMs: z.number().finite().nonnegative(),
    duration: z.number().finite().nonnegative(),
  }),
  sampleRate: z.literal(WAVEFORM_SAMPLE_RATE),
  samplesPerPeak: z.number().int().min(8).safe(),
  peakCount: z.number().int().positive().max(MAX_WAVEFORM_PEAKS),
  data: z.string().min(1).max(6_000_000),
});

export type SavedWaveform = z.infer<typeof WaveformSchema>;
export type WaveformSource = SavedWaveform["source"];

export function waveformMatchesMedia(
  waveform: SavedWaveform | undefined,
  media: { path: string; duration: number } | null,
) {
  return !!(
    waveform &&
    media &&
    waveform.source.path === media.path &&
    waveform.source.duration === media.duration
  );
}
