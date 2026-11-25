import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShareCard } from '../../api/queries';
import type { Locale } from '../../api/types';
import { Button, Notice, Segmented, useToast } from '../../components/ui';

type AmountChoice = 'hidden' | 'shown';

const WIDTH = 1200;
const HEIGHT = 630;

function svgUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function download(href: string, file: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = file;
  document.body.append(a);
  a.click();
  a.remove();
}

/** Draws the card SVG onto a canvas at twice its size and returns a PNG blob. */
async function toPng(svg: string): Promise<Blob> {
  const img = new Image();
  img.decoding = 'async';
  img.src = svgUrl(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no png'))), 'image/png'));
}

/**
 * The shareable installment card. The back end draws it (no merchants, banks or card numbers; system
 * fonts; nothing loaded from the network). Here it lies on the ground like a physical card: the one you
 * share sits straight, the two behind it lean a little. Amounts are off until the user turns them on.
 */
export function ShareCardBody() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [amounts, setAmounts] = useState<AmountChoice>('hidden');
  const locale: Locale = i18n.language.startsWith('tr') ? 'tr' : 'en';
  const card = useShareCard({ locale, amounts: amounts === 'shown' });
  const name = `kalan-taksit-${amounts === 'shown' ? 'tutarli' : 'oranli'}`;

  async function savePng() {
    if (!card.data) return;
    try {
      const blob = await toPng(card.data.svg);
      const url = URL.createObjectURL(blob);
      download(url, `${name}.png`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.show(t('installments.share.saved', { file: `${name}.png` }), 'positive');
    } catch {
      toast.show(t('installments.share.failed'), 'negative');
    }
  }

  function saveSvg() {
    if (!card.data) return;
    download(svgUrl(card.data.svg), `${name}.svg`);
    toast.show(t('installments.share.saved', { file: `${name}.svg` }), 'positive');
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center">
      <div className="group relative mx-auto w-full max-w-2xl px-4 py-6">
        <div aria-hidden className="absolute inset-x-4 inset-y-6 -rotate-3 rounded-card border border-line bg-paper transition-transform duration-(--duration-2) ease-(--ease-out) group-hover:-rotate-4" />
        <div aria-hidden className="absolute inset-x-4 inset-y-6 rotate-2 rounded-card border border-line bg-paper transition-transform duration-(--duration-2) ease-(--ease-out) group-hover:rotate-3" />
        <figure className="relative overflow-hidden rounded-card border border-line bg-paper">
          {card.isPending ? (
            <div className="aspect-[1200/630] w-full" role="status" aria-label={t('common.loading')} />
          ) : card.isError ? (
            <div className="grid aspect-[1200/630] w-full place-items-center p-6">
              <Notice
                tone="warning"
                title={t('installments.share.loadError')}
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void card.refetch()}>
                    {t('common.retry')}
                  </Button>
                }
              />
            </div>
          ) : (
            <img
              src={svgUrl(card.data.svg)}
              alt={card.data.sentence}
              width={WIDTH}
              height={HEIGHT}
              className="block aspect-[1200/630] h-auto w-full"
            />
          )}
        </figure>
      </div>
      <div className="grid content-start gap-5">
        <Segmented<AmountChoice>
          label={t('installments.share.amounts')}
          value={amounts}
          onChange={setAmounts}
          options={[
            { value: 'hidden', label: t('installments.share.hidden') },
            { value: 'shown', label: t('installments.share.shown') },
          ]}
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" icon={<Download aria-hidden className="size-4" />} onClick={() => void savePng()} disabled={!card.data}>
            {t('installments.share.png')}
          </Button>
          <Button variant="secondary" icon={<Download aria-hidden className="size-4" />} onClick={saveSvg} disabled={!card.data}>
            {t('installments.share.svg')}
          </Button>
        </div>
      </div>
    </div>
  );
}
