import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Job, Event } from "../shared/ipc";
export class Jobs {
  active = new Map<
    string,
    { controller: AbortController; job: Job; done: Promise<void> }
  >();
  constructor(private emit: (e: Event) => void) {}
  start(
    kind: string,
    run: (
      signal: AbortSignal,
      update: (progress: number, message: string) => void,
      beginCommit: () => void,
    ) => Promise<void>,
  ) {
    const id = randomUUID(),
      controller = new AbortController(),
      job: Job = {
        id,
        kind,
        state: "running",
        progress: 0,
        message: "Starting…",
      };
    const entry = { controller, job, done: Promise.resolve() };
    this.active.set(id, entry);
    const update = (progress: number, message: string) => {
      Object.assign(job, {
        progress: Math.max(0, Math.min(100, progress)),
        message,
      });
      this.emit({ type: "job", job: { ...job } });
    };
    const beginCommit = () => {
      controller.signal.throwIfAborted();
      job.cancellable = false;
      update(95, "Finalizing installation…");
    };
    entry.done = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return run(controller.signal, update, beginCommit);
      })
      .then(() => {
        job.state = controller.signal.aborted ? "cancelled" : "done";
        update(100, job.state === "done" ? "Complete" : "Cancelled");
      })
      .catch((e) => {
        job.state = controller.signal.aborted ? "cancelled" : "failed";
        update(
          job.progress,
          job.state === "cancelled" ? "Cancelled" : String(e.message || e),
        );
      })
      .finally(() => this.active.delete(id));
    update(0, "Starting…");
    return id;
  }
  cancel(id: string) {
    const entry = this.active.get(id);
    if (entry && entry.job.cancellable !== false) entry.controller.abort();
  }
  cancelAll() {
    for (const id of this.active.keys()) this.cancel(id);
  }
  async cancelAllAndWait() {
    this.cancelAll();
    await Promise.all([...this.active.values()].map((entry) => entry.done));
  }
}
export function run(
  exe: string,
  args: string[],
  signal: AbortSignal,
  onText: (text: string) => void = () => {},
  onBinary?: (data: Buffer) => void,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Error("Cancelled"));
    let output = "",
      error = "",
      settled = false;
    const child = spawn(exe, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env,
    });
    const cancel = () => {
      if (child.pid) {
        if (process.platform === "win32") {
          const killer = spawn(
            "taskkill.exe",
            ["/PID", String(child.pid), "/T", "/F"],
            { shell: false, windowsHide: true },
          );
          killer.on("error", () => child.kill());
        } else child.kill("SIGTERM");
      }
    };
    signal.addEventListener("abort", cancel, { once: true });
    const finish = (e?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", cancel);
      e ? reject(e) : resolve(output);
    };
    child.stdout.on("data", (b: Buffer) => {
      if (onBinary) onBinary(b);
      else {
        output += b.toString();
        if (output.length > 16000000) {
          cancel();
          finish(Error("Process output exceeded limit"));
        }
        onText(b.toString());
      }
    });
    child.stderr.on("data", (b: Buffer) => {
      error = (error + b.toString()).slice(-4000);
      onText(b.toString());
    });
    child.on("error", (e) =>
      finish(
        Error(
          `Could not start ${exe}: ${e.message}. Check its executable path in Settings.`,
        ),
      ),
    );
    child.on("close", (code) =>
      finish(
        signal.aborted
          ? Error("Cancelled")
          : code !== 0
            ? Error(`${exe} exited ${code}: ${error}`)
            : undefined,
      ),
    );
  });
}
