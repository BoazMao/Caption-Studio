import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(".tools/bundled-tools");
await mkdir(root, { recursive: true });
const tools = [
  {
    name: "yt-dlp.exe",
    url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe",
    sha256: "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
  },
  {
    name: "whisper-bin-x64.zip",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip",
    sha256: "0d2eca299c248f965bd0341bcb219db4b433c7f0c0ce2200d4df85765e8156a9",
  },
];
async function hash(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}
async function download(url, file) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body)
    throw Error(`Download failed (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
}
for (const tool of tools) {
  const file = path.join(root, tool.name);
  const present = await hash(file).catch(() => "");
  if (present !== tool.sha256) {
    console.log(`Downloading ${tool.name}`);
    await download(tool.url, file);
  }
  if ((await hash(file)) !== tool.sha256)
    throw Error(`Checksum mismatch: ${tool.name}`);
}
await new Promise((resolve, reject) => {
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:RACCOON_ARCHIVE -DestinationPath $env:RACCOON_EXTRACT -Force",
    ],
    {
      shell: false,
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        RACCOON_ARCHIVE: path.join(root, "whisper-bin-x64.zip"),
        RACCOON_EXTRACT: path.join(root, "whisper-archive"),
      },
    },
  );
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(Error(`Whisper extraction failed: ${code}`)),
  );
});
async function findCli(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name === "whisper-cli.exe") return dir;
    if (item.isDirectory()) {
      const found = await findCli(path.join(dir, item.name));
      if (found) return found;
    }
  }
}
const bin = await findCli(path.join(root, "whisper-archive"));
if (!bin) throw Error("Upstream archive has no whisper-cli.exe");
await mkdir(path.join(root, "whisper"), { recursive: true });
for (const name of await readdir(bin))
  if (name === "whisper-cli.exe" || name.endsWith(".dll"))
    await copyFile(path.join(bin, name), path.join(root, "whisper", name));
for (const [url, name] of [
  [
    "https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.7.6/LICENSE",
    "whisper/LICENSE",
  ],
  [
    "https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.08.19/LICENSE",
    "yt-dlp-source.LICENSE",
  ],
  [
    "https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.08.19/THIRD_PARTY_LICENSES.txt",
    "yt-dlp-THIRD_PARTY_LICENSES.txt",
  ],
])
  await download(url, path.join(root, name));
await copyFile(
  "node_modules/ffmpeg-static/ffmpeg.exe.LICENSE",
  path.join(root, "yt-dlp-binary-GPLv3.LICENSE"),
);
await writeFile(
  path.join(root, "manifest.json"),
  JSON.stringify(
    { tools, whisperVersion: "1.7.6", ytdlpVersion: "2026.08.19" },
    null,
    2,
  ),
);
console.log(
  "Verified yt-dlp and whisper.cpp CPU x64 runtime prepared (models excluded).",
);
