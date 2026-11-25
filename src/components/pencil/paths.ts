/** A small string hash so each mark gets its own, but stable, hand-drawn wobble. */
function seed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function jitter(s: number, n: number, min: number, max: number): string {
  const v = ((Math.imul(s ^ (n * 2654435761), 1597334677) >>> 0) % 1000) / 1000;
  return (min + v * (max - min)).toFixed(1);
}

/** Scribble underline in a 100x10 box (the site's curve, seeded instead of random). */
export function scribblePath(key: string): string {
  const s = seed(key);
  return `M1,${jitter(s, 1, 5, 7)} C18,${jitter(s, 2, 1, 4)} 32,${jitter(s, 3, 7, 9)} 50,${jitter(s, 4, 4, 6)} S84,${jitter(s, 5, 2, 4)} 99,${jitter(s, 6, 5, 8)}`;
}

/** Hand circle in a 100x40 box: starts top left, goes round once and overshoots. */
export const CIRCLE_PATH = 'M18,6 C40,1 84,2 96,14 C102,24 86,37 52,38 C20,39 2,32 3,20 C4,10 20,4 44,3';

/** Margin mark in a 24x24 box: two quick strokes, the way a reader flags a line in the margin. */
export const MARGIN_PATH = 'M8,4 C7.4,9 6.8,14 6.2,20 M15.5,4 C14.9,9 14.3,14 13.7,20';
