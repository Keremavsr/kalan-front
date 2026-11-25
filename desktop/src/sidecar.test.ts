import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  legacyArgs,
  parseReadyLine,
  resolveBackCommand,
  Sidecar,
  SIDECAR_ARGS,
  splitCommand,
  STDERR_TAIL_LINES,
  type SpawnFn,
} from './sidecar.js';

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 4242;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdinClosed = false;

  constructor() {
    super();
    this.stdin.on('finish', () => {
      this.stdinClosed = true;
      this.emit('stdin-closed');
    });
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }
}

interface SpawnCall {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
  child: FakeChild;
}

function fakeSpawn(setup?: (child: FakeChild, call: number) => void) {
  const calls: SpawnCall[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    const child = new FakeChild();
    calls.push({ command, args, options, child });
    setup?.(child, calls.length);
    return child as unknown as ChildProcess;
  };
  return { spawn, calls };
}

const ready = (port: number) => `${JSON.stringify({ event: 'ready', port })}\n`;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('parseReadyLine', () => {
  it('reads the port from the ready event', () => {
    expect(parseReadyLine('{"event":"ready","port":51234}')).toBe(51234);
    expect(parseReadyLine('  {"event": "ready", "port": 8765}\r')).toBe(8765);
  });

  it('ignores anything that is not a valid ready event', () => {
    for (const line of [
      '',
      'INFO: Uvicorn running on http://127.0.0.1:8765',
      '{"event":"ready"}',
      '{"event":"started","port":8765}',
      '{"event":"ready","port":"8765"}',
      '{"event":"ready","port":0}',
      '{"event":"ready","port":70000}',
      '{"event":"ready","port":12.5}',
      '{"event":"ready","port":8765',
      'null',
      '[1,2]',
    ]) {
      expect(parseReadyLine(line)).toBeNull();
    }
  });
});

describe('back end command', () => {
  it('splits a command line with quotes', () => {
    expect(splitCommand('"C:\\Program Files\\Py\\python.exe" -m kalan')).toEqual([
      'C:\\Program Files\\Py\\python.exe',
      '-m',
      'kalan',
    ]);
    expect(splitCommand("  kalan  '' x")).toEqual(['kalan', '', 'x']);
  });

  it('uses kalan from PATH in dev, or KALAN_BACK_CMD', () => {
    const base = { packaged: false, resourcesPath: '/r', platform: 'win32' as const };
    expect(resolveBackCommand({ ...base, env: {} })).toEqual({ command: 'kalan', args: [...SIDECAR_ARGS] });
    expect(resolveBackCommand({ ...base, env: { KALAN_BACK_CMD: 'py -m kalan' } })).toEqual({
      command: 'py',
      args: ['-m', 'kalan', ...SIDECAR_ARGS],
    });
  });

  it('uses the bundled binary when packaged', () => {
    const win = resolveBackCommand({ packaged: true, env: { KALAN_BACK_CMD: 'x' }, resourcesPath: '/r', platform: 'win32' });
    expect(win.command).toBe(path.join('/r', 'kalan-back', 'kalan.exe'));
    expect(win.args).toEqual([...SIDECAR_ARGS]);
    const linux = resolveBackCommand({ packaged: true, env: {}, resourcesPath: '/r', platform: 'linux' });
    expect(linux.command).toBe(path.join('/r', 'kalan-back', 'kalan'));
  });

  it('builds legacy arguments without the handshake flag', () => {
    expect(legacyArgs(['-m', 'kalan', ...SIDECAR_ARGS], 8765)).toEqual(['-m', 'kalan', 'serve', '--port', '8765']);
  });
});

describe('Sidecar lifecycle', () => {
  it('resolves with the port from a ready line split across chunks', async () => {
    const { spawn, calls } = fakeSpawn((child) => {
      setTimeout(() => {
        child.stderr.write('INFO: starting\n');
        child.stdout.write('{"event":"rea');
        child.stdout.write('dy","port":51234}\n');
      }, 0);
    });
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn, env: { A: '1' } });
    await expect(sidecar.start()).resolves.toBe(51234);
    expect(sidecar.status).toBe('ready');
    expect(sidecar.port).toBe(51234);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe('kalan');
    expect(calls[0]!.args).toEqual(SIDECAR_ARGS);
    expect(calls[0]!.options).toMatchObject({ stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { A: '1' } });
    expect(sidecar.stderrTail()).toEqual(['INFO: starting']);
  });

  it('keeps only the last 20 stderr lines', async () => {
    const { spawn } = fakeSpawn((child) => {
      setTimeout(() => {
        for (let i = 1; i <= 30; i++) child.stderr.write(`line ${i}\r\n`);
        child.stdout.write(ready(5000));
      }, 0);
    });
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn });
    await sidecar.start();
    const tail = sidecar.stderrTail();
    expect(tail).toHaveLength(STDERR_TAIL_LINES);
    expect(tail[0]).toBe('line 11');
    expect(tail.at(-1)).toBe('line 30');
  });

  it('emits crash with the stderr tail when the back end dies after it was ready', async () => {
    const { spawn, calls } = fakeSpawn((child) => setTimeout(() => child.stdout.write(ready(5001)), 0));
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn });
    await sidecar.start();
    const crash = vi.fn();
    sidecar.on('crash', crash);
    const child = calls[0]!.child;
    child.stderr.write('ERROR: database is locked (OperationalError)\n');
    await tick();
    child.exit(1);
    expect(crash).toHaveBeenCalledWith({ code: 1, signal: null, stderr: ['ERROR: database is locked (OperationalError)'] });
    expect(sidecar.status).toBe('failed');
    expect(sidecar.port).toBeNull();
  });

  it('can start again after a crash', async () => {
    const { spawn, calls } = fakeSpawn((child, n) => setTimeout(() => child.stdout.write(ready(6000 + n)), 0));
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn });
    await sidecar.start();
    calls[0]!.child.exit(1);
    await expect(sidecar.start()).resolves.toBe(6002);
    expect(sidecar.status).toBe('ready');
  });

  it('stops by closing stdin and does not report a crash or kill', async () => {
    const killTree = vi.fn();
    const { spawn, calls } = fakeSpawn((child) => {
      setTimeout(() => child.stdout.write(ready(5002)), 0);
      child.on('stdin-closed', () => setTimeout(() => child.exit(0), 5));
    });
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn, killTree });
    await sidecar.start();
    const crash = vi.fn();
    sidecar.on('crash', crash);
    await sidecar.stop();
    expect(calls[0]!.child.stdinClosed).toBe(true);
    expect(killTree).not.toHaveBeenCalled();
    expect(crash).not.toHaveBeenCalled();
    expect(sidecar.status).toBe('stopped');
  });

  it('kills the process tree when the back end ignores stdin', async () => {
    const { spawn, calls } = fakeSpawn((child) => setTimeout(() => child.stdout.write(ready(5003)), 0));
    const killTree = vi.fn((child: ChildProcess) => (child as unknown as FakeChild).exit(null, 'SIGKILL'));
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn, killTree, stopGraceMs: 20 });
    await sidecar.start();
    await sidecar.stop();
    expect(killTree).toHaveBeenCalledWith(calls[0]!.child);
    expect(sidecar.status).toBe('stopped');
  });

  it('stop is a no-op when nothing runs', async () => {
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn: fakeSpawn().spawn });
    await expect(sidecar.stop()).resolves.toBeUndefined();
  });

  it('rejects when the command cannot be started', async () => {
    const { spawn } = fakeSpawn((child) => {
      setTimeout(() => child.emit('error', Object.assign(new Error('spawn kalan ENOENT'), { code: 'ENOENT' })), 0);
    });
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn });
    await expect(sidecar.start()).rejects.toThrow('cannot start back end (ENOENT)');
    expect(sidecar.status).toBe('failed');
  });

  it('rejects with the exit code and keeps stderr when the back end exits before it is ready', async () => {
    const { spawn } = fakeSpawn((child) => {
      setTimeout(() => {
        child.stderr.write('kalan: cannot listen on 127.0.0.1:0 (address in use)\n');
        setTimeout(() => child.exit(1), 0);
      }, 0);
    });
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn });
    await expect(sidecar.start()).rejects.toThrow('exited before it was ready (code 1)');
    expect(sidecar.stderrTail()).toEqual(['kalan: cannot listen on 127.0.0.1:0 (address in use)']);
  });

  it('falls back to the legacy port and /health when --print-port is unknown', async () => {
    const { spawn, calls } = fakeSpawn((child, n) => {
      if (n === 1) setTimeout(() => child.exit(2), 0);
    });
    let polls = 0;
    const healthCheck = vi.fn(async (port: number) => {
      await tick();
      return port === 8765 && ++polls >= 3;
    });
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn, healthCheck, pollIntervalMs: 1 });
    await expect(sidecar.start()).resolves.toBe(8765);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.args).toEqual(['serve', '--port', '8765']);
    expect(healthCheck).toHaveBeenCalledWith(8765);
  });

  it('kills the back end and rejects when it never becomes ready', async () => {
    const { spawn, calls } = fakeSpawn();
    const killTree = vi.fn();
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn, killTree, readyTimeoutMs: 20 });
    await expect(sidecar.start()).rejects.toThrow('did not become ready within 20 ms');
    expect(killTree).toHaveBeenCalledWith(calls[0]!.child);
  });

  it('refuses a second start while running', async () => {
    const { spawn } = fakeSpawn((child) => setTimeout(() => child.stdout.write(ready(5004)), 0));
    const sidecar = new Sidecar({ command: 'kalan', args: SIDECAR_ARGS, spawn });
    await sidecar.start();
    await expect(sidecar.start()).rejects.toThrow('already ready');
  });
});
