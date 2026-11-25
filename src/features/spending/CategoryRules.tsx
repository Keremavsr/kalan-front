import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryRules, useDeleteCategoryRule } from '../../api/queries';
import { isApiError, type CategoryRule } from '../../api/types';
import { Button, List, ListRow, Notice, Section, useToast } from '../../components/ui';
import { SectionState } from '../../components/ui/SectionState';
import { useErrorText } from '../../components/ui/errorText';
import { formatDate } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { useCategoryName } from './categoryName';

/** The user's category rules, oldest first as the back end returns them, each with a delete. */
export function CategoryRules() {
  const { t } = useTranslation();
  const rules = useCategoryRules();
  return (
    <Section id="category-rules" title={t('spending.rules.title')} description={t('spending.rules.intro')}>
      <SectionState query={rules} failed={t('spending.rules.failed')}>
        {() =>
          rules.data?.items.length ? (
            <List label={t('spending.rules.title')}>
              {rules.data.items.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </List>
          ) : (
            <p className="border-t border-ink py-5 text-body text-ink">{t('spending.rules.empty')}</p>
          )
        }
      </SectionState>
    </Section>
  );
}

function RuleRow({ rule }: { rule: CategoryRule }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const toast = useToast();
  const name = useCategoryName();
  const errorText = useErrorText();
  const remove = useDeleteCategoryRule();
  const [failed, setFailed] = useState<string | null>(null);

  function drop() {
    setFailed(null);
    remove.mutate(rule.id, {
      onSuccess: () => toast.show(t('spending.rules.deleted', { pattern: rule.pattern }), 'positive'),
      onError: (error) => {
        if (isApiError(error, 'not_found')) {
          toast.show(t('spending.rules.gone'), 'neutral');
          return;
        }
        setFailed(errorText(error, t('spending.rules.deleteFailed')));
      },
    });
  }

  return (
    <ListRow
      meta={<time dateTime={rule.created_at}>{formatDate(rule.created_at.slice(0, 10), locale)}</time>}
      title={rule.pattern}
      detail={<span className="text-muted">{t('spending.rules.sets', { category: name(rule.category) })}</span>}
      aside={
        <Button
          variant="secondary"
          size="sm"
          onClick={drop}
          loading={remove.isPending}
          aria-label={t('spending.rules.deleteFor', { pattern: rule.pattern })}
        >
          {t('spending.rules.delete')}
        </Button>
      }
    >
      {failed ? (
        <Notice tone="critical" role="alert" className="mt-3">
          {failed}
        </Notice>
      ) : null}
    </ListRow>
  );
}
