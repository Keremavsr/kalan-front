import type { InstallmentBreakdown, Schedule, SchedulePlan } from '../../api/types';
import type { Series } from '../../lib/series';

/** Purchase plans take these pigments in order; a cash advance is always kraplak, its interest and tax grey. */
const PLAN_SERIES: Series[] = ['prusya', 'asi', 'toprak', 'ink'];
export const CASH_SERIES: Series = 'kraplak';
export const EXTRA_SERIES: Series = 'gri';

export function seriesFor(plan: SchedulePlan, index: number): Series {
  if (plan.kind === 'cash_advance') return CASH_SERIES;
  return PLAN_SERIES[index % PLAN_SERIES.length]!;
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
