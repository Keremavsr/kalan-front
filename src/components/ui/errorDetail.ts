/**
 * The text behind "Hata ayrıntısını kopyala": the error's name, its message and the component stack.
 * Nothing from the screen's data, and no source locations (they carry file paths, so the user's folder name).
 */
export function errorDetail(error: Error, componentStack: string): string {
  const head = `${error.name || 'Error'}: ${error.message}`;
  const stack = componentStack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `  ${line.replace(/\s*\([^)]*\)$/, '')}`)
    .join('\n');
  return stack ? `${head}\n\n${stack}` : head;
}

/** Fallback for a boundary that should leave no trace (the AI strip). */
export const silentFallback = () => null;
