/**
 * The renderer's uncaught errors and console.error lines, written by the main process to a small rotating file
 * under `app.getPath('logs')`. One line per entry, each message cut at 500 characters; when the file passes the
 * size limit it moves to `<name>.1.log` (the older copy is dropped), so the folder never holds more than two files.
 */
import fs from 'node:fs';
import path from 'node:path';

export const MESSAGE_LIMIT = 500;
export const LOG_LIMIT_BYTES = 256 * 1024;

/** One line, at most `limit` characters (an ellipsis marks the cut). */
export function clip(text: string, limit = MESSAGE_LIMIT): string {
  const flat = text.trim().replace(/\s*\r?\n\s*/g, ' | ');
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

export interface ErrorLogOptions {
  dir: string;
  name?: string;
  maxBytes?: number;
  now?: () => Date;
}

export class ErrorLog {
  readonly dir: string;
  readonly file: string;
  private readonly older: string;
  private readonly maxBytes: number;
  private readonly now: () => Date;

  constructor({ dir, name = 'renderer', maxBytes = LOG_LIMIT_BYTES, now = () => new Date() }: ErrorLogOptions) {
    this.dir = dir;
    this.file = path.join(dir, `${name}.log`);
    this.older = path.join(dir, `${name}.1.log`);
    this.maxBytes = maxBytes;
    this.now = now;
  }

  /** Never throws: a log that cannot be written must not take the app down with it. */
  write(level: string, message: string): void {
    const line = `${this.now().toISOString()} ${level} ${clip(message)}\n`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      if (this.size() + Buffer.byteLength(line) > this.maxBytes) {
        fs.rmSync(this.older, { force: true });
        if (fs.existsSync(this.file)) fs.renameSync(this.file, this.older);
      }
      fs.appendFileSync(this.file, line, 'utf8');
    } catch {
      // Disk full or folder locked: drop the line.
    }
  }

  private size(): number {
    try {
      return fs.statSync(this.file).size;
    } catch {
      return 0;
    }
  }
}
