import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCardFeePrompt, useCardFees, useDraftCardFeeLetter, useProviders } from '../../api/queries';
import type { CardFee, CardFeeDraft, CardFeePrompt } from '../../api/types';
import { Button, Card, EmptyState, KeyValue, List, ListRow, Money, Notice, QueryState, Section, useMoneyFormatter } from '../../components/ui';
import { CopyButton } from '../../components/ui/CopyButton';
import { SourceText } from '../../components/ui/ExternalLink';
import { TextAreaField } from '../../components/ui/TextArea';
import { PencilLink } from '../../components/pencil';
import { bankName } from '../../lib/banks';
import { formatDate } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { printText } from './print';

/** Annual card fee lines, and for the one chosen: where to apply, on what basis, and a letter to edit. */
export function CardFeesSection() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fees = useCardFees();
  const [chosen, setChosen] = useState<string | null>(null);
  const items = fees.data?.items ?? [];
  const open = items.filter((f) => !f.refunded);

  return (
    <Section id="card-fees" title={t('rights.feesTitle')} description={t('rights.feesIntro')}>
      <QueryState query={fees}>
        {() =>
          items.length ? (
            <div className="grid gap-8">
              <List label={t('rights.feesList')}>
                {items.map((fee) => (
                  <ListRow
                    key={fee.transaction_id}
                    meta={formatDate(fee.date, locale)}
                    title={`${bankName(fee.bank)} ${fee.product}`}
                    detail={
                      <span className="text-meta text-muted">
                        {fee.description} · •••• {fee.card_last4}
                        {fee.supplementary_card ? <> · {t('rights.feeSupplementary')}</> : null}
                        {fee.refunded ? <> · {t('rights.feeRefunded')}</> : null}
                      </span>
                    }
                    aside={
                      <div className="grid justify-items-end gap-2">
                        <Money minor={fee.amount} currency={fee.currency} className="text-lead font-bold" />
                        {fee.refunded ? null : (
                          <Button
                            variant={chosen === fee.transaction_id ? 'primary' : 'secondary'}
                            size="sm"
                            aria-pressed={chosen === fee.transaction_id}
                            onClick={() => setChosen(fee.transaction_id)}
                            aria-label={t('rights.feeChooseLabel', { bank: bankName(fee.bank), date: formatDate(fee.date, locale) })}
                          >
                            {t('rights.feeChoose')}
                          </Button>
                        )}
                      </div>
                    }
                  />
                ))}
              </List>
              {chosen ? (
                <FeeLetter fee={items.find((f) => f.transaction_id === chosen)!} key={chosen} />
              ) : open.length ? (
                <p className="text-body text-muted">{t('rights.feePick')}</p>
              ) : (
                <p className="text-body text-ink">{t('rights.feeAllRefunded')}</p>
              )}
            </div>
          ) : (
            <EmptyState mark="empty" title={t('rights.feesEmptyTitle')}>
              {t('rights.feesEmpty')}
            </EmptyState>
          )
        }
      </QueryState>
    </Section>
  );
}

function FeeLetter({ fee }: { fee: CardFee }) {
  const { t } = useTranslation();
  const prompt = useCardFeePrompt(fee.transaction_id);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView?.({ block: 'nearest' }), []);

  return (
    <div ref={ref}>
      <Card title={t('rights.letterTitle', { bank: bankName(fee.bank) })} description={t('rights.letterIntro')}>
        <QueryState query={prompt}>{() => (prompt.data ? <LetterBody data={prompt.data} /> : null)}</QueryState>
        {prompt.isError && prompt.error.code === 'card_fee_not_found' ? (
          <Notice tone="info" className="px-0">
            {t('rights.feeGone')}
          </Notice>
        ) : null}
      </Card>
    </div>
  );
}

function LetterBody({ data }: { data: CardFeePrompt }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const hh = data.hakem_heyeti;
  const providers = useProviders();
  const selected = providers.data?.providers.find((p) => p.id === providers.data?.selected && p.available);
  const draft = useDraftCardFeeLetter();
  const placeholders = data.placeholders.join(', ');

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-meta font-semibold text-ink">{t('rights.routeTitle')}</h3>
          <KeyValue
            className="mt-2"
            items={[
              {
                label: t('rights.routeWhere'),
                value: data.route === 'hakem_heyeti' ? t('rights.routeHakem') : t('rights.routeCourt'),
              },
              {
                label: t('rights.routeLimit'),
                value: (
                  <span>
                    {t('rights.routeLimitValue', { year: hh.year, limit: fmt(hh.limit_below, hh.currency) })}
                    <span className="mt-0.5 block font-normal">
                      <SourceText source={hh.source} />
                    </span>
                  </span>
                ),
              },
              { label: t('rights.routeFee'), value: <Money minor={data.fee.amount} currency={data.fee.currency} /> },
              { label: t('rights.routeHow'), value: <span className="font-normal">{hh.apply}</span> },
            ]}
          />
          <p className="mt-3 text-meta text-muted">{t(data.route === 'hakem_heyeti' ? 'rights.routeWhyHakem' : 'rights.routeWhyCourt')}</p>
        </div>
        <div>
          <h3 className="text-meta font-semibold text-ink">{t('rights.basisTitle')}</h3>
          <ul className="mt-2 border-t-2 border-ink">
            {data.legal_basis.map((b) => (
              <li key={b.id} className="border-b border-line py-3">
                <p className="text-body font-semibold text-ink">{b.title}</p>
                <p className="mt-1 text-meta text-ink">{b.summary}</p>
                <p className="mt-1 text-meta text-muted">
                  <SourceText source={b.source} />
                  {b.verified === false ? <> · {t('rights.basisUnverified')}</> : null}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 border-t border-line pt-6">
        <p className="max-w-measure text-body text-ink">{t('rights.letterHow', { placeholders })}</p>
        <div className="flex flex-wrap items-center gap-3">
          {selected ? (
            <Button variant="primary" loading={draft.isPending} dot={<ArrowRight className="size-4" />} onClick={() => draft.mutate(data.fee.transaction_id)}>
              {t('rights.draftWith', { name: selected.name })}
            </Button>
          ) : null}
          <CopyButton text={data.prompt} label={t('rights.copyPrompt')} done={t('rights.copied')} failed={t('rights.copyFailed')} />
        </div>
        {!selected && providers.isSuccess ? (
          <p className="text-meta text-muted">
            {t('rights.noProvider')} <PencilLink to="/settings">{t('rights.toSettings')}</PencilLink>
          </p>
        ) : null}
        {draft.isPending ? (
          <p role="status" className="text-meta text-muted">
            {t('rights.draftPending')}
          </p>
        ) : null}
        {draft.isError ? (
          <Notice tone="critical" role="alert" className="px-0">
            {draft.error.code === 'no_provider' || draft.error.code === 'provider_unavailable'
              ? t('rights.errProvider')
              : draft.error.code === 'provider_failed'
                ? t('rights.errProviderFailed')
                : draft.error.code === 'network'
                  ? t('rights.errNetwork')
                  : t('rights.errGeneric', { message: draft.error.message })}
          </Notice>
        ) : null}
        {draft.data ? <LetterEditor draft={draft.data} title={t('rights.printTitle', { date: formatDate(data.fee.date, locale) })} key={draft.submittedAt} /> : null}
      </div>
    </div>
  );
}

/** The model's letter as an editable text: copy, print, and the placeholders still to fill in. */
function LetterEditor({ draft, title }: { draft: CardFeeDraft; title: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState(draft.text);
  // What is still in the edited text, so the list empties as the user fills the fields in.
  const toFill = draft.placeholders_kept.filter((p) => text.includes(p));

  return (
    <div className="enter grid gap-4">
      {draft.placeholders_missing.length ? (
        <Notice tone="warning" title={t('rights.missingTitle')}>
          {t('rights.missingBody', { list: draft.placeholders_missing.join(', ') })}
        </Notice>
      ) : null}
      <TextAreaField label={t('rights.letterLabel')} value={text} onChange={(e) => setText(e.target.value)} rows={16} hint={t('rights.letterHint')} />
      {toFill.length ? (
        <p className="text-meta text-ink">
          <span className="font-semibold">{t('rights.toFill')}</span> {toFill.join(', ')}
        </p>
      ) : (
        <p className="text-meta text-muted">{t('rights.allFilled')}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={text} label={t('rights.copyLetter')} done={t('rights.copied')} failed={t('rights.copyFailed')} />
        <Button variant="secondary" icon={<Printer aria-hidden className="size-4" />} onClick={() => printText(text, title)}>
          {t('rights.print')}
        </Button>
      </div>
      <p className="text-meta text-muted">{t('rights.notStored')}</p>
    </div>
  );
}
