import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { deflate, inflate } from "node:zlib";
import {
  MAX_WAVEFORM_PEAKS,
  WAVEFORM_SAMPLE_RATE,
  WaveformSchema,
  type SavedWaveform,
  type WaveformSource,
} from "../shared/waveform";

const compress = promisify(deflate);
const decompress = promisify(inflate);

export async function waveformSource(
  file: string,
  duration: number,
): Promise<WaveformSource> {
  const info = await stat(file);
  if (!info.isFile()) throw Error("Waveform media must be a file");
  return { path: file, size: info.size, modifiedAtMs: info.mtimeMs, duration };
}

export function sameWaveformSource(a: WaveformSource, b: WaveformSource) {
  return (
    a.path === b.path &&
    a.size === b.size &&
    a.modifiedAtMs === b.modifiedAtMs &&
    a.duration === b.duration
  );
}

export async function saveWaveform(
  peaks: number[],
  source: WaveformSource,
  samplesPerPeak: number,
): Promise<SavedWaveform> {
  if (!peaks.length || peaks.length > MAX_WAVEFORM_PEAKS)
    throw Error("Waveform peak count is outside the supported range");
  const bytes = Buffer.allocUnsafe(peaks.length * 2);
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i];
    if (!Number.isFinite(peak) || peak < 0 || peak > 1)
      throw Error("Invalid waveform peak");
    // Peaks come from PCM16 amplitudes. This retains their exact precision.
    bytes.writeUInt16LE(Math.round(peak * 32768), i * 2);
  }
  return WaveformSchema.parse({
    version: 1,
    encoding: "deflate-u16le",
    source,
    sampleRate: WAVEFORM_SAMPLE_RATE,
    samplesPerPeak,
    peakCount: peaks.length,
    data: (await compress(bytes)).toString("base64"),
  });
}

export async function restoreWaveform(
  input: unknown,
  source: WaveformSource,
): Promise<{ waveform: SavedWaveform; peaks: number[] } | null> {
  const parsed = WaveformSchema.safeParse(input);
  if (!parsed.success || !sameWaveformSource(parsed.data.source, source))
    return null;
  try {
    const waveform = parsed.data;
    const bytes = await decompress(Buffer.from(waveform.data, "base64"), {
      maxOutputLength: waveform.peakCount * 2,
    });
    if (bytes.length !== waveform.peakCount * 2) return null;
    const peaks: number[] = [];
    for (let i = 0; i < bytes.length; i += 2) {
      const amplitude = bytes.readUInt16LE(i);
      if (amplitude > 32768) return null;
      peaks.push(amplitude / 32768);
    }
    return { waveform, peaks };
  } catch {
    // A damaged optional cache must not prevent opening/editing a project.
    return null;
  }
}
