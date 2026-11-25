import type { InstallmentBreakdown, Schedule, SchedulePlan } from '../../api/types';

/** Chart and table colour role for each plan, stable by plan order. */
export const SERIES = ['bg-series-1', 'bg-series-2', 'bg-series-3', 'bg-series-4'] as const;

export function seriesFor(plan: SchedulePlan, index: number): string {
  if (plan.kind === 'cash_advance') return 'bg-series-cash';
  return SERIES[index % SERIES.length]!;
}

export function extraOf(b: InstallmentBreakdown): number {
  return b.interest + b.bsmv + b.kkdf;
}

export interface ScheduleReading {
  total: number;
  peak: { month: string; total: number } | null;
  after: { month: string; max: number } | null;
}

/**
 * Turns the schedule into the facts the lead sentence states: the window
 * total, the heaviest month, and the ceiling once the heaviest stretch is over.
 * This only reads totals the back end computed; it adds nothing new.
 */
export function readSchedule(schedule: Schedule): ScheduleReading {
  const months = schedule.months;
  const total = months.reduce((sum, m) => sum + m.total, 0);
  if (!months.length || total === 0) return { total, peak: null, after: null };
  let peakIndex = 0;
  months.forEach((m, i) => {
    if (m.total > months[peakIndex]!.total) peakIndex = i;
  });
  const peak = { month: months[peakIndex]!.month, total: months[peakIndex]!.total };
  const dropIndex = months.findIndex((m, i) => i > peakIndex && m.total < peak.total);
  if (dropIndex === -1) return { total, peak, after: null };
  const max = Math.max(...months.slice(dropIndex).map((m) => m.total));
  return { total, peak, after: { month: months[dropIndex]!.month, max } };
}
