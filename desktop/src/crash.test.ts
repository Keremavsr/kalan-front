import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RendererCrashes } from './crash.js';
import { clip, ErrorLog, MESSAGE_LIMIT } from './error-log.js';

describe('RendererCrashes', () => {
  it('reloads after the first crash and gives up from the second', () => {
    const crashes = new RendererCrashes();
    expect(crashes.onGone('crashed')).toBe('recover');
    expect(crashes.onGone('oom')).toBe('give-up');
    expect(crashes.onGone('killed')).toBe('give-up');
    expect(crashes.crashes).toBe(3);
  });

  it('does not count a clean exit', () => {
    const crashes = new RendererCrashes();
    expect(crashes.onGone('clean-exit')).toBe('ignore');
    expect(crashes.onGone('abnormal-exit')).toBe('recover');
  });
});

describe('ErrorLog', () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalan-log-'));
    dirs.push(dir);
    return path.join(dir, 'logs');
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('cuts each message at 500 characters and keeps it on one line', () => {
    expect(clip('a'.repeat(900))).toHaveLength(MESSAGE_LIMIT);
    expect(clip('a'.repeat(900)).endsWith('…')).toBe(true);
    expect(clip('TypeError: x\n    at Foo (app.js:1)\n')).toBe('TypeError: x | at Foo (app.js:1)');
    expect(clip('short')).toBe('short');
  });

  it('creates the folder and appends timestamped lines', () => {
    const dir = tempDir();
    const log = new ErrorLog({ dir, now: () => new Date('2026-01-02T03:04:05.000Z') });
    log.write('error', 'Uncaught TypeError: invented');
    log.write('unresponsive', 'window stopped responding');
    expect(fs.readFileSync(log.file, 'utf8')).toBe(
      '2026-01-02T03:04:05.000Z error Uncaught TypeError: invented\n' +
        '2026-01-02T03:04:05.000Z unresponsive window stopped responding\n',
    );
  });

  it('rotates past the size limit and keeps at most two files', () => {
    const dir = tempDir();
    const log = new ErrorLog({ dir, maxBytes: 400 });
    for (let i = 0; i < 40; i += 1) log.write('error', `line ${i} ${'x'.repeat(60)}`);
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual(['renderer.1.log', 'renderer.log']);
    for (const file of files) expect(fs.statSync(path.join(dir, file)).size).toBeLessThanOrEqual(400);
    expect(fs.readFileSync(log.file, 'utf8')).toContain('line 39');
  });

  it('never throws when the folder cannot be written', () => {
    const dir = tempDir();
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.writeFileSync(dir, 'a file where the folder should be');
    expect(() => new ErrorLog({ dir }).write('error', 'invented')).not.toThrow();
  });
});
