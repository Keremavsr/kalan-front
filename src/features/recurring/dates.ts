/** Today as an ISO date in local time. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** This month as YYYY-MM. */
export function thisMonth(): string {
  return today().slice(0, 7);
}

/** A year range around this year for the date pickers: [this year + from, this year + to]. */
export function yearsAround(from: number, to: number): [number, number] {
  const year = new Date().getFullYear();
  return [year + from, year + to];
}
