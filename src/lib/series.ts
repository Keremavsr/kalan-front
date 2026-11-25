/**
 * Data series colours: the four pigments, ink and the light grey, each with the text colour
 * that passes contrast on it. Only charts, swatches and data cells use these.
 */
export type Series = 'ink' | 'prusya' | 'asi' | 'kraplak' | 'toprak' | 'gri';

export const SERIES_CLASS: Record<Series, { fill: string; text: string }> = {
  ink: { fill: 'bg-series-ink', text: 'text-on-series-ink' },
  prusya: { fill: 'bg-series-prusya', text: 'text-on-series-prusya' },
  asi: { fill: 'bg-series-asi', text: 'text-on-series-asi' },
  kraplak: { fill: 'bg-series-kraplak', text: 'text-on-series-kraplak' },
  toprak: { fill: 'bg-series-toprak', text: 'text-on-series-toprak' },
  gri: { fill: 'bg-series-gri', text: 'text-on-series-gri' },
};

/** Order for ordinary series (plans, top categories). Gri is kept for "the rest" and for interest and tax. */
export const SERIES_ORDER: Series[] = ['ink', 'prusya', 'asi', 'toprak', 'kraplak'];

export function seriesAt(index: number): Series {
  return SERIES_ORDER[index % SERIES_ORDER.length]!;
}
