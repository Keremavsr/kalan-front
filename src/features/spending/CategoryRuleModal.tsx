import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryRules, useCreateCategoryRule, useDeleteCategoryRule } from '../../api/queries';
import { isApiError, type Transaction } from '../../api/types';
import { Button, KeyValue, Modal, Notice, SelectField, useToast } from '../../components/ui';
import { useErrorText } from '../../components/ui/errorText';
import { patternOf } from './pattern';
import { useCategoryName } from './categoryName';

/**
 * Changing the category of one row is a rule for its merchant (`POST /category-rules`, `apply: true`):
 * every stored row of that merchant moves, and later statements follow it. The sheet says so before saving.
 */
export function CategoryRuleModal({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  // Keep the last row while the sheet closes, so its exit runs on the same content; every opening
  // is a fresh sheet (new key), so an old error or choice does not come back.
  const [state, setState] = useState({ tx, open: Boolean(tx), n: 0 });
  if (tx && (!state.open || tx !== state.tx)) setState({ tx, open: true, n: state.n + 1 });
  else if (!tx && state.open) setState({ ...state, open: false });
  return state.tx ? <RuleSheet key={state.n} tx={state.tx} open={state.open} onClose={onClose} /> : null;
}

function RuleSheet({ tx, open, onClose }: { tx: Transaction; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const name = useCategoryName();
  const errorText = useErrorText();
  const rules = useCategoryRules();
  const create = useCreateCategoryRule();
  const remove = useDeleteCategoryRule();
  const pattern = patternOf(tx);
  const allowed = rules.data?.categories ?? [];
  const [category, setCategory] = useState(tx.category ?? '');

  const duplicate = isApiError(create.error, 'duplicate_rule') ? create.error : null;
  const oldRuleId = duplicate ? String(duplicate.details.rule_id ?? '') : '';
  const oldRule = rules.data?.items.find((r) => r.id === oldRuleId);

  function save() {
    create.mutate(
      { pattern, category, apply: true },
      {
        onSuccess: (data) => {
          toast.show(
            data.applied > 0
              ? t('spending.rule.saved', { count: data.applied, merchant: pattern, category: name(category) })
              : t('spending.rule.savedNone', { merchant: pattern, category: name(category) }),
            'positive',
          );
          onClose();
        },
      },
    );
  }

  async function replace() {
    if (!oldRuleId) return;
    try {
      await remove.mutateAsync(oldRuleId);
    } catch (error) {
      // The old rule is already gone (404): saving again is still the right step.
      if (!isApiError(error, 'not_found')) return;
    }
    save();
  }

  const otherError =
    create.isError && !duplicate
      ? errorText(create.error, t('spending.rule.failed'), {
          invalid_pattern: t('spending.rule.invalidPattern'),
          validation_error: t('spending.rule.invalidCategory'),
        })
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('spending.rule.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="go"
            onClick={save}
            loading={create.isPending && !remove.isPending}
            disabled={!category || category === tx.category || Boolean(duplicate) || rules.isPending}
          >
            {t('spending.rule.apply')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <p className="text-body text-ink">{t('spending.rule.explain', { merchant: pattern })}</p>
        <KeyValue
          items={[
            { label: t('spending.rule.merchant'), value: pattern },
            { label: t('spending.rule.current'), value: name(tx.category) },
          ]}
        />
        {rules.isError ? (
          <Notice
            className="-mx-5"
            tone="warning"
            role="alert"
            title={t('spending.rule.listFailed')}
            actions={
              <Button variant="secondary" size="sm" onClick={() => void rules.refetch()}>
                {t('common.retry')}
              </Button>
            }
          >
            {errorText(rules.error, '')}
          </Notice>
        ) : (
          <SelectField
            label={t('spending.rule.newCategory')}
            value={category}
            disabled={rules.isPending}
            onChange={(e) => {
              setCategory(e.target.value);
              create.reset();
            }}
            options={[
              ...(tx.category && allowed.includes(tx.category) ? [] : [{ value: tx.category ?? '', label: name(tx.category) }]),
              ...allowed.map((c) => ({ value: c, label: name(c) })),
            ]}
          />
        )}
        {duplicate ? (
          // The notice is paper on the paper sheet: pull it out by its padding so its text lines up with the rest.
          <Notice
            className="-mx-5"
            tone="warning"
            role="alert"
            title={t('spending.rule.duplicateTitle')}
            actions={
              <Button variant="secondary" size="sm" onClick={() => void replace()} loading={remove.isPending || create.isPending}>
                {t('spending.rule.replace')}
              </Button>
            }
          >
            {oldRule
              ? t('spending.rule.duplicate', { pattern: oldRule.pattern, category: name(oldRule.category) })
              : t('spending.rule.duplicateUnknown')}
          </Notice>
        ) : null}
        {otherError ? (
          <Notice tone="critical" role="alert" className="-mx-5">
            {otherError}
          </Notice>
        ) : null}
      </div>
    </Modal>
  );
}
