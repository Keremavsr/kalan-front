/**
 * What the window does when its renderer process dies (`render-process-gone`). The first time in a session it
 * says so on the status page and loads the screen again; from the second time on it stops on the status page
 * with a Restart button, so a renderer that keeps crashing does not loop.
 */
export type GoneReason =
  | 'clean-exit'
  | 'abnormal-exit'
  | 'killed'
  | 'crashed'
  | 'oom'
  | 'launch-failed'
  | 'integrity-failure'
  | 'memory-eviction';

export type GoneAction = 'ignore' | 'recover' | 'give-up';

/** How long the status page tells the user about the first crash before the screen comes back. */
export const RECOVER_NOTICE_MS = 2500;

export class RendererCrashes {
  private count = 0;

  get crashes(): number {
    return this.count;
  }

  /** `clean-exit` is a normal shutdown (quit, process swap), not a crash. */
  onGone(reason: GoneReason): GoneAction {
    if (reason === 'clean-exit') return 'ignore';
    this.count += 1;
    return this.count === 1 ? 'recover' : 'give-up';
  }
}
