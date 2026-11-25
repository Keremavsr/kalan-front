/**
 * Back end sidecar: starts `kalan serve`, waits for it to listen, keeps the last stderr lines and stops it on quit.
 *
 * Handshake: the back end is started with `--port 0 --print-port` and prints exactly one JSON line to stdout,
 * `{"event":"ready","port":N}`, once it listens. An older back end that does not know `--print-port` exits with
 * argparse's usage code 2; the sidecar then starts it once more on the fixed legacy port and polls `GET /health`.
 *
 * Shutdown: closing the child's stdin makes the back end exit cleanly; if it is still alive after a grace period
 * the whole process tree is killed (PyInstaller and pip launchers run the real server as a grandchild).
 */
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';

export const STDERR_TAIL_LINES = 20;
export const LEGACY_PORT = 8765;
export const SIDECAR_ARGS = ['serve', '--port', '0', '--print-port'] as const;

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface SidecarOptions {
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  spawn?: SpawnFn;
  killTree?: (child: ChildProcess) => void;
  healthCheck?: (port: number) => Promise<boolean>;
  readyTimeoutMs?: number;
  stopGraceMs?: number;
  pollIntervalMs?: number;
  legacyPort?: number;
}

export type SidecarStatus = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface SidecarExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string[];
}

/** Returns the port from a `{"event":"ready","port":N}` line, or null for anything else. */
export function parseReadyLine(line: string): number | null {
  const text = line.trim();
  if (!text.startsWith('{')) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { event, port } = value as { event?: unknown; port?: unknown };
  if (event !== 'ready') return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

/** Splits a command line such as `"C:\\Program Files\\py\\python.exe" -m kalan` into words, honouring quotes. */
export function splitCommand(input: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) words.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (started) words.push(current);
  return words;
}

export interface BackCommandInput {
  packaged: boolean;
  env: NodeJS.ProcessEnv;
  resourcesPath: string;
  platform: NodeJS.Platform;
}

/** dev: `KALAN_BACK_CMD` or `kalan` from PATH. packaged: the bundled binary in `resources/kalan-back/`. */
export function resolveBackCommand(input: BackCommandInput): { command: string; args: string[] } {
  if (input.packaged) {
    const binary = input.platform === 'win32' ? 'kalan.exe' : 'kalan';
    return { command: path.join(input.resourcesPath, 'kalan-back', binary), args: [...SIDECAR_ARGS] };
  }
  const words = splitCommand(input.env.KALAN_BACK_CMD ?? '');
  const [command, ...prefix] = words.length > 0 ? words : ['kalan'];
  return { command: command!, args: [...prefix, ...SIDECAR_ARGS] };
}

/** The same arguments for a back end without `--print-port`: fixed port, no handshake flag. */
export function legacyArgs(args: readonly string[], port: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--print-port') continue;
    if (arg === '--port') {
      out.push('--port', String(port));
      i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

export function defaultKillTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    nodeSpawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on(
      'error',
      () => child.kill(),
    );
  } else {
    child.kill('SIGKILL');
  }
}

export async function defaultHealthCheck(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

class LineSplitter {
  private buffer = '';
  constructor(private readonly onLine: (line: string) => void) {}
  push(chunk: Buffer | string): void {
    this.buffer += chunk.toString();
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      this.onLine(this.buffer.slice(0, index).replace(/\r$/, ''));
      this.buffer = this.buffer.slice(index + 1);
    }
  }
  flush(): void {
    if (this.buffer) this.onLine(this.buffer.replace(/\r$/, ''));
    this.buffer = '';
  }
}

interface SidecarEvents {
  /** The back end exited while it was serving (not during stop()). */
  crash: [SidecarExit];
}

export class Sidecar extends EventEmitter<SidecarEvents> {
  private child: ChildProcess | null = null;
  private tail: string[] = [];
  private currentStatus: SidecarStatus = 'idle';
  private currentPort: number | null = null;
  private readonly spawnFn: SpawnFn;
  private readonly killTree: (child: ChildProcess) => void;
  private readonly healthCheck: (port: number) => Promise<boolean>;

  constructor(private readonly options: SidecarOptions) {
    super();
    this.spawnFn = options.spawn ?? nodeSpawn;
    this.killTree = options.killTree ?? defaultKillTree;
    this.healthCheck = options.healthCheck ?? defaultHealthCheck;
  }

  get status(): SidecarStatus {
    return this.currentStatus;
  }

  get port(): number | null {
    return this.currentPort;
  }

  /** The last stderr lines of the current or last run (the back end keeps PII out of stderr). */
  stderrTail(): string[] {
    return [...this.tail];
  }

  /** Starts the back end and resolves with its port once it listens. Rejects if it fails to start. */
  async start(): Promise<number> {
    if (this.currentStatus === 'starting' || this.currentStatus === 'ready') {
      throw new Error(`sidecar is already ${this.currentStatus}`);
    }
    this.tail = [];
    this.currentPort = null;
    this.currentStatus = 'starting';
    try {
      const port = await this.launch(this.options.args, false).catch((error: unknown) => {
        if (error instanceof UsageError) {
          const legacyPort = this.options.legacyPort ?? LEGACY_PORT;
          return this.launch(legacyArgs(this.options.args, legacyPort), true, legacyPort);
        }
        throw error;
      });
      this.currentPort = port;
      this.currentStatus = 'ready';
      return port;
    } catch (error) {
      this.currentStatus = 'failed';
      throw error;
    }
  }

  /** Stops the back end: closes stdin, waits for a clean exit, then kills the process tree. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      this.child = null;
      this.currentStatus = 'stopped';
      return;
    }
    this.currentStatus = 'stopping';
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.stdin?.end();
    const grace = this.options.stopGraceMs ?? 3000;
    const clean = await Promise.race([exited.then(() => true), delay(grace).then(() => false)]);
    if (!clean) {
      this.killTree(child);
      await Promise.race([exited, delay(2000)]);
    }
    this.child = null;
    this.currentPort = null;
    this.currentStatus = 'stopped';
  }

  private pushStderr(line: string): void {
    if (!line) return;
    this.tail.push(line);
    if (this.tail.length > STDERR_TAIL_LINES) this.tail.splice(0, this.tail.length - STDERR_TAIL_LINES);
  }

  private launch(args: readonly string[], legacy: boolean, legacyPort?: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const child = this.spawnFn(this.options.command, args, {
        cwd: this.options.cwd,
        env: this.options.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.child = child;
      let settled = false;
      let ready = false;
      const timeoutMs = this.options.readyTimeoutMs ?? 30000;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const onReady = (port: number) =>
        settle(() => {
          ready = true;
          resolve(port);
        });
      const fail = (message: string) =>
        settle(() => {
          this.killTree(child);
          reject(new Error(message));
        });

      const timer = setTimeout(() => fail(`back end did not become ready within ${timeoutMs} ms`), timeoutMs);

      const stdout = new LineSplitter((line) => {
        if (ready || legacy) return;
        const port = parseReadyLine(line);
        if (port !== null) onReady(port);
      });
      const stderr = new LineSplitter((line) => this.pushStderr(line));
      child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));

      child.once('error', (error: NodeJS.ErrnoException) => {
        if (!settled) settle(() => reject(new Error(`cannot start back end (${error.code ?? error.name})`)));
      });

      child.once('exit', (code, signal) => {
        stderr.flush();
        if (this.child === child && !ready) this.child = null;
        if (!settled) {
          settle(() => {
            if (!legacy && code === 2 && args.includes('--print-port')) reject(new UsageError());
            else reject(new Error(`back end exited before it was ready (code ${code ?? signal ?? 'unknown'})`));
          });
          return;
        }
        if (ready && this.child === child) {
          this.child = null;
          if (this.currentStatus === 'stopping' || this.currentStatus === 'stopped') return;
          this.currentStatus = 'failed';
          this.currentPort = null;
          this.emit('crash', { code, signal, stderr: this.stderrTail() });
        }
      });

      if (legacy && legacyPort !== undefined) {
        const interval = this.options.pollIntervalMs ?? 250;
        const poll = async () => {
          while (!settled) {
            if (await this.healthCheck(legacyPort)) {
              onReady(legacyPort);
              return;
            }
            await delay(interval);
          }
        };
        void poll();
      }
    });
  }
}

class UsageError extends Error {
  constructor() {
    super('back end does not support --print-port');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
