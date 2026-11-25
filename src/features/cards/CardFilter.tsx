import { useTranslation } from 'react-i18next';
import { useCards } from '../../api/queries';
import { SelectField } from '../../components/ui';

/** "" means every card. */
export type CardChoice = string;

/**
 * Which card a list shows. Only drawn when there is more than one card; with one card there is nothing to choose.
 */
export function CardFilter({ value, onChange, className }: { value: CardChoice; onChange: (id: CardChoice) => void; className?: string }) {
  const { t } = useTranslation();
  const cards = useCards();
  const items = cards.data?.items ?? [];
  if (items.length < 2) return null;
  return (
    <SelectField
      label={t('cards.filter')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fieldClassName={className ?? 'w-72 max-w-full'}
      options={[{ value: '', label: t('cards.all') }, ...items.map((c) => ({ value: c.id, label: c.label }))]}
    />
  );
}
