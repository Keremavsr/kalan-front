import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Copy, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { errorDetail } from './errorDetail';

export interface ErrorFallbackProps {
  error: Error;
  componentStack: string;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** When it changes (the route, for a screen), a caught error is cleared and the children render again. */
  resetKey?: unknown;
  /** What to show instead of the children. Defaults to the screen error section. */
  fallback?: (props: ErrorFallbackProps) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  resetKey: unknown;
}

function asError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : 'Unknown error');
}

/**
 * Catches a render error below it, so one broken component takes only its own part of the page down.
 * The root of the app has one, every screen has one (reset when the route changes), and the strip and
 * the add-entry sheet have silent ones.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '', resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: asError(error) };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    if (Object.is(props.resetKey, state.resetKey)) return null;
    return { resetKey: props.resetKey, error: null, componentStack: '' };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  reset = () => this.setState({ error: null, componentStack: '' });

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    const props = { error, componentStack, reset: this.reset };
    return this.props.fallback ? this.props.fallback(props) : <ScreenError {...props} />;
  }
}

/** "Bu ekranı gösteremedim" with Retry and Copy details; `scope="app"` for the root, where no menu is left. */
export function ScreenError({ error, componentStack, reset, scope = 'screen' }: ErrorFallbackProps & { scope?: 'screen' | 'app' }) {
  const { t } = useTranslation();
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');
  const detail = errorDetail(error, componentStack);

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = setTimeout(() => setCopy('idle'), 2400);
    return () => clearTimeout(timer);
  }, [copy]);

  async function copyDetail() {
    try {
      await navigator.clipboard.writeText(detail);
      setCopy('done');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section role="alert" aria-labelledby="screen-error-title" className="max-w-measure py-6">
      <h1 id="screen-error-title" className="title-section text-ink">
        {scope === 'app' ? t('error.appTitle') : t('error.title')}
      </h1>
      <p className="mt-3 text-lead text-ink">{scope === 'app' ? t('error.appBody') : t('error.body')}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={<RotateCcw aria-hidden className="size-4" />} onClick={reset}>
          {t('error.retry')}
        </Button>
        <Button variant="secondary" icon={<Copy aria-hidden className="size-4" />} onClick={() => void copyDetail()}>
          {t('error.copy')}
        </Button>
        <span aria-live="polite" className="text-meta text-muted">
          {copy === 'done' ? t('error.copied') : copy === 'failed' ? t('error.copyFailed') : ''}
        </span>
      </div>
      <details className="mt-6 text-meta text-muted">
        <summary className="cursor-pointer text-ink">{t('error.detail')}</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">{detail}</pre>
      </details>
    </section>
  );
}
