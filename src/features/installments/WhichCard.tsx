import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWhichCard } from '../../api/queries';
import type { Assumption, CardOption } from '../../api/types';
import { Button, List, ListRow, Notice, TextField } from '../../components/ui';
import { bankName } from '../../lib/banks';
import { formatDate, formatMonth } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Which card leaves the most interest-free days for an installment purchase on a given day. */
export function WhichCardBody() {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const which = useWhichCard(ISO_DATE.test(date) ? date : undefined);

  return (
    <div className="grid gap-6">
      <TextField
        type="date"
        label={t('installments.which.date')}
        value={date || which.data?.date || ''}
        onChange={(e) => setDate(e.target.value)}
        fieldClassName="w-56"
      />
      {which.isPending ? (
        <p className="text-body text-muted" role="status">
          {t('common.loading')}
        </p>
      ) : which.isError ? (
        <Notice
          tone="warning"
          title={t('installments.which.failed')}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void which.refetch()}>
              {t('common.retry')}
            </Button>
          }
        >
          {t('common.loadError')}
        </Notice>
      ) : which.data.cards.length ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <List label={t('installments.which.label')}>
            {which.data.cards.map((card) => (
              <CardRow key={`${card.bank}-${card.card_last4}`} card={card} best={card === which.data.cards[0] && which.data.best !== null} />
            ))}
          </List>
          <Assumptions items={which.data.assumptions} />
        </div>
      ) : (
        <p className="text-body text-ink">{t('installments.which.none')}</p>
      )}
    </div>
  );
}

function CardRow({ card, best }: { card: CardOption; best: boolean }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const notes = [
    card.shifted_days > 0 ? t('installments.which.shifted', { count: card.shifted_days }) : null,
    card.basis === 'projected' ? t('installments.which.projected') : null,
    card.stale ? t('installments.which.stale') : null,
  ].filter(Boolean);

  return (
    <ListRow
      meta={t('common.card', { last4: card.card_last4 })}
      title={`${bankName(card.bank)} ${card.product}`}
      detail={
        <>
          {t('installments.which.row', {
            cut: formatDate(card.cut_off, locale),
            due: formatDate(card.due_date_effective, locale),
            month: formatMonth(card.first_installment_month, locale),
          })}
          {notes.map((n) => (
            <span key={n} className="mt-1 block text-meta text-muted">
              {n}
            </span>
          ))}
        </>
      }
      aside={
        <span className="block text-body font-bold whitespace-nowrap">
          {t('installments.which.days', { count: card.interest_free_days })}
          {best ? <span className="mt-0.5 block text-meta font-normal">{t('installments.which.best')}</span> : null}
        </span>
      }
    />
  );
}

/** The museum label of the site: a heavy rule, a short key, the assumption in plain words. */
function Assumptions({ items }: { items: Assumption[] }) {
  const { t, i18n } = useTranslation();
  if (!items.length) return null;
  return (
    <section aria-labelledby="which-assumptions">
      <h3 id="which-assumptions" className="mb-2 text-meta font-semibold text-ink">
        {t('installments.which.assumptions')}
      </h3>
      <ol className="border-t-2 border-ink text-meta text-ink">
        {items.map((a, i) => {
          const key = `installments.which.assumption.${a.key}`;
          return (
            <li key={a.key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-line py-2.5">
              <span className="font-extrabold">{String.fromCharCode(65 + i)}</span>
              <span>{i18n.exists(key) ? t(key) : a.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
