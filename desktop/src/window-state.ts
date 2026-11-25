/** Remembers the main window's size, position and maximized state in `window-state.json` under userData. */
import fs from 'node:fs';
import path from 'node:path';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  bounds: Rect;
  maximized: boolean;
}

export const DEFAULT_SIZE = { width: 1280, height: 820 };
export const MIN_SIZE = { width: 960, height: 640 };

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

export function parseWindowState(raw: string): WindowState | null {
  try {
    const value = JSON.parse(raw) as { bounds?: unknown; maximized?: unknown };
    if (!isRect(value.bounds)) return null;
    return { bounds: value.bounds, maximized: value.maximized === true };
  } catch {
    return null;
  }
}

/** Keeps a saved position only if its title bar area is still on one of the current displays. */
export function fitToDisplays(state: WindowState | null, workAreas: Rect[]): Partial<Rect> & { width: number; height: number } {
  if (!state) return { ...DEFAULT_SIZE };
  const width = Math.max(MIN_SIZE.width, Math.round(state.bounds.width));
  const height = Math.max(MIN_SIZE.height, Math.round(state.bounds.height));
  const { x, y } = state.bounds;
  const visible = workAreas.some(
    (a) => x + 100 > a.x && x + 100 < a.x + a.width && y + 20 > a.y && y + 20 < a.y + a.height,
  );
  return visible ? { x: Math.round(x), y: Math.round(y), width, height } : { width, height };
}

export class WindowStateStore {
  private readonly file: string;
  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, 'window-state.json');
  }

  load(): WindowState | null {
    try {
      return parseWindowState(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return null;
    }
  }

  save(state: WindowState): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(state));
    } catch {
      // A lost window position is not worth an error dialog.
    }
  }
}
