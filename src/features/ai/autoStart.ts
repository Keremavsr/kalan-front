import { useEffect, useRef } from 'react';
import { useAnalysisRun, useProviders, useStartAnalysisAll, useStatements, useTransactions } from '../../api/queries';
import type { AnalysisRun, StatementSummary, Transaction } from '../../api/types';

/** The local day of the last automatic start, so it happens at most once a day. */
export const AUTO_RUN_KEY = 'kalan.ai.autoRun';

export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function readDay(): string | null {
  try {
    return localStorage.getItem(AUTO_RUN_KEY);
  } catch {
    return null;
  }
}

function writeDay(day: string) {
  try {
    localStorage.setItem(AUTO_RUN_KEY, day);
  } catch {
    // Private mode or storage off: the in-memory guard still keeps it to one start per launch.
  }
}

/** Whether the latest batch lets a new one start by itself: none running, and the last one did not fail. */
export function batchAllowsStart(run: AnalysisRun | null | undefined): boolean {
  return run?.status !== 'pending' && run?.status !== 'failed';
}

/** Statements the back end reports as not read by the tool yet (or failed). */
export function hasUnreadStatement(items: StatementSummary[]): boolean {
  return items.some((s) => s.analysis_status === 'none' || s.analysis_status === 'failed');
}

export function hasUncategorizedRow(items: Transaction[]): boolean {
  return items.some((tx) => tx.category === null);
}

/**
 * With an AI tool already chosen, opening the app starts the batch over every statement by itself when there is
 * something for it: a statement the tool has not read, or a statement row without a category. At most once a
 * day, and not again after a batch that failed (the Spending screen's button still starts one by hand).
 */
export function useAutoAnalysis(now: () => Date = () => new Date()) {
  const providers = useProviders();
  const run = useAnalysisRun();
  const statements = useStatements();
  const start = useStartAnalysisAll();
  const tried = useRef(false);

  const selected = providers.data?.providers.find((p) => p.id === providers.data?.selected);
  const today = localDay(now());
  const eligible =
    Boolean(selected?.available) &&
    run.isSuccess &&
    batchAllowsStart(run.data) &&
    statements.isSuccess &&
    (statements.data?.items.length ?? 0) > 0 &&
    readDay() !== today;
  const unread = eligible && hasUnreadStatement(statements.data?.items ?? []);
  // Rows are asked for only when every statement is read: the back end says which rows still have no category.
  const rows = useTransactions({ source: 'statement' }, { enabled: eligible && !unread });
  const uncategorized = rows.isSuccess && hasUncategorizedRow(rows.data.items);
  const decided = eligible && (unread || rows.isSuccess || rows.isError);
  const mutate = start.mutate;

  useEffect(() => {
    if (!decided || tried.current) return;
    tried.current = true;
    if (!unread && !uncategorized) return;
    writeDay(today);
    // A refused start (no tool, tool gone) stays quiet; the strip and Settings say what is wrong.
    mutate(undefined, { onError: () => undefined });
  }, [decided, unread, uncategorized, today, mutate]);
}
