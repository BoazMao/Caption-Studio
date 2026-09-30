import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  statfs,
  access,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { run } from "./jobs";

const runtimeKey = "whisperx-3.8.6-python-3.12.14-cpu-v1";
const uvURL =
  "https://github.com/astral-sh/uv/releases/download/0.12.21/uv-x86_64-pc-windows-msvc.zip";
const uvHash =
  "5d223efa0bf00208c3853246af09420419dfbd352536aa6bb8163d6170e23890";
const requirements = ["whisperx==3.8.6", "transformers==4.57.6"];

function owned(root: string, file: string) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw Error("Invalid managed runtime path");
  return file;
}

export async function managedPython(root: string): Promise<string | undefined> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(root, "current.json"), "utf8"),
    );
    if (
      manifest.key !== runtimeKey ||
      !/^environments\/[0-9a-f-]+\/Scripts\/python\.exe$/.test(manifest.python)
    )
      return;
    const python = owned(root, path.resolve(root, manifest.python));
    await access(python);
    return python;
  } catch {
    return;
  }
}

async function findUV(root: string): Promise<string | undefined> {
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.name === "uv.exe") return path.join(root, item.name);
    if (item.isDirectory()) {
      const found = await findUV(path.join(root, item.name));
      if (found) return found;
    }
  }
}

async function bootstrap(
  root: string,
  signal: AbortSignal,
  update: (n: number, message: string) => void,
) {
  const tools = path.join(root, "bootstrap");
  await mkdir(tools, { recursive: true });
  const zip = path.join(tools, "uv.zip");
  const verified = async () =>
    createHash("sha256")
      .update(await readFile(zip))
      .digest("hex") === uvHash;
  if (!(await verified().catch(() => false))) {
    const response = await fetch(uvURL, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
    });
    if (!response.ok || !response.body)
      throw Error(
        `Installer download failed (${response.status}). Retry with an internet connection.`,
      );
    const total = Number(response.headers.get("content-length"));
    let bytes = 0;
    const stream = Readable.fromWeb(response.body as any);
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      update(
        total ? Math.min(10, (bytes / total) * 10) : 5,
        `Downloading installer: ${(bytes / 1e6).toFixed(1)} MB`,
      );
    });
    await pipeline(stream, createWriteStream(zip), { signal });
  }
  if (!(await verified()))
    throw Error("Installer checksum mismatch. Retry installation.");
  signal.throwIfAborted();
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:RACCOON_UV_ZIP -DestinationPath $env:RACCOON_UV_DIR -Force",
    ],
    signal,
    undefined,
    undefined,
    { RACCOON_UV_ZIP: zip, RACCOON_UV_DIR: path.join(tools, "uv") },
  );
  const uv = await findUV(path.join(tools, "uv"));
  if (!uv) throw Error("Installer archive has no uv.exe");
  return uv;
}

type Dependencies = {
  runner?: typeof run;
  bootstrap?: typeof bootstrap;
  checkDisk?: boolean;
};
export async function installWhisperX(
  root: string,
  signal: AbortSignal,
  update: (n: number, message: string) => void,
  dependencies: Dependencies = {},
) {
  await mkdir(root, { recursive: true });
  if (dependencies.checkDisk !== false) {
    const disk = await statfs(root);
    if (disk.bavail * disk.bsize < 6 * 1024 ** 3)
      throw Error(
        "WhisperX installation needs at least 6.5 GB of free disk space, including temporary downloads.",
      );
  }
  const execute = dependencies.runner || run;
  const directory = owned(root, path.join(root, "environments", randomUUID()));
  const python = path.join(directory, "Scripts", "python.exe");
  const environment = {
    UV_PYTHON_INSTALL_DIR: path.join(root, "python"),
    UV_CACHE_DIR: path.join(root, "cache"),
    UV_PYTHON_BIN_DIR: path.join(root, "bin"),
    UV_LINK_MODE: "copy",
    UV_PYTHON_INSTALL_REGISTRY: "false",
    UV_NO_MODIFY_PATH: "1",
  };
  const stage = (n: number, title: string) => (text: string) => {
    const detail = text
      .replace(/\x1b\[[0-9;]*m/g, "")
      .split(/[\r\n]/)
      .filter(Boolean)
      .at(-1)
      ?.trim();
    update(n, detail ? `${title}: ${detail.slice(0, 200)}` : title);
  };
  try {
    signal.throwIfAborted();
    update(1, "Downloading verified installer");
    const uv = await (dependencies.bootstrap || bootstrap)(
      root,
      signal,
      update,
    );
    update(12, "Installing private Python 3.12.14");
    await execute(
      uv,
      [
        "venv",
        "--managed-python",
        "--python",
        "3.12.14",
        "--no-project",
        directory,
      ],
      signal,
      stage(20, "Installing private Python"),
      undefined,
      environment,
    );
    update(25, "Installing CPU inference libraries");
    await execute(
      uv,
      [
        "pip",
        "install",
        "--python",
        python,
        "--no-cache",
        "--only-binary",
        ":all:",
        "--default-index",
        "https://download.pytorch.org/whl/cpu",
        "torch==2.8.0+cpu",
        "torchaudio==2.8.0+cpu",
        "torchvision==0.23.0+cpu",
      ],
      signal,
      stage(40, "Installing CPU libraries"),
      undefined,
      environment,
    );
    update(55, "Installing WhisperX dependencies");
    await execute(
      uv,
      ["pip", "install", "--python", python, "--no-cache", ...requirements],
      signal,
      stage(70, "Installing WhisperX"),
      undefined,
      environment,
    );
    update(90, "Verifying recognition and alignment modules");
    await execute(
      python,
      [
        "-I",
        "-c",
        "import importlib.metadata as m; import torch,torchaudio; from whisperx.asr import load_model; from whisperx.alignment import load_align_model; assert m.version('whisperx') == '3.8.6'; assert m.version('transformers') == '4.57.6'; assert torch.__version__ == '2.8.0+cpu'; assert torchaudio.__version__ == '2.8.0+cpu'; print('WhisperX ready on CPU')",
      ],
      signal,
    );
    signal.throwIfAborted();
    const marker = path.join(root, "current.json"),
      temporary = marker + ".tmp";
    await writeFile(
      temporary,
      JSON.stringify({
        key: runtimeKey,
        python: path.relative(root, python).replaceAll(path.sep, "/"),
        installedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    signal.throwIfAborted();
    await rename(temporary, marker);
    return python;
  } catch (error) {
    await rm(owned(root, directory), { recursive: true, force: true });
    throw error;
  }
}
