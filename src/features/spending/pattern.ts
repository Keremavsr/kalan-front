import type { Transaction } from '../../api/types';

/** The merchant name a rule is written for: the cleaned merchant, else the printed description. */
export function patternOf(tx: Transaction): string {
  return (tx.merchant ?? tx.description).trim();
}
