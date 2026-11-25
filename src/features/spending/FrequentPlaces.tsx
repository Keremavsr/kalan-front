import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFrequentPlaces } from '../../api/queries';
import { Card, List, ListRow, Rich, useMoneyFormatter } from '../../components/ui';
import { useCategoryName } from './categoryName';

/**
 * Places you spend at often (supermarket, restaurant, food delivery): not regular payments, so they live here.
 * Monthly averages come from the back end.
 */
export function FrequentPlaces() {
  const { t } = useTranslation();
  const places = useFrequentPlaces();
  const fmt = useMoneyFormatter();
  const name = useCategoryName();
  const data = places.data;
  if (!data?.items.length) return null;
  const top = data.items.slice(0, 6);

  return (
    <Card title={t('spending.places.title')} description={t('spending.places.intro', { count: data.window.count })}>
      <List label={t('spending.places.title')}>
        {top.map((p) => (
          <ListRow
            key={p.merchant}
            meta={name(p.category)}
            title={
              <Link
                to={`/spending?merchant=${encodeURIComponent(p.merchant)}`}
                className="underline decoration-transparent decoration-1 underline-offset-4 transition-[text-decoration-color] duration-(--duration-1) hover:decoration-ink"
              >
                {p.merchant}
              </Link>
            }
            detail={<span className="text-meta text-muted">{t('spending.places.visits', { count: p.visits, months: p.months_seen })}</span>}
            aside={
              <span className="text-body">
                <Rich i18nKey="spending.places.average" values={{ amount: fmt(p.monthly_average, data.currency) }} />
              </span>
            }
          />
        ))}
      </List>
    </Card>
  );
}
