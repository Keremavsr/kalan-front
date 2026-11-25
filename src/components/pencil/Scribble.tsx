import { scribblePath } from './paths';

/**
 * Pencil scribble under a word. Put it inside an element with the classes
 * `scribble-host relative`; it draws on hover and focus, and stays drawn when the
 * host has aria-current="page" or data-marked="true".
 */
export function Scribble({ seed }: { seed: string }) {
  return (
    <svg className="scribble" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden focusable="false">
      <path pathLength={1} d={scribblePath(seed)} />
    </svg>
  );
}
