import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/cx';

/**
 * primary: ink pill. go: the positive primary (toprak green), for upload and save.
 * secondary: ink outline pill. ghost: plain underlined text. icon: round outline button for a lone icon.
 */
export type ButtonVariant = 'primary' | 'go' | 'secondary' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Icon drawn in the paper dot on the right of a primary or go pill (the arrow dot of the site). */
  dot?: ReactNode;
  /** Leading icon for secondary and ghost buttons, or the only content of an icon button. */
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper border-ink',
  go: 'bg-go text-paper border-go',
  secondary: 'bg-transparent text-ink border-ink hover:bg-ink hover:text-paper',
  ghost: 'bg-transparent text-ink border-transparent underline decoration-1 underline-offset-4 hover:decoration-transparent',
  icon: 'bg-transparent text-ink border-ink hover:bg-ink hover:text-paper',
};

const sizes: Record<ButtonSize, { pill: string; dotted: string; icon: string; dot: string }> = {
  sm: { pill: 'h-9 px-4 text-meta gap-2', dotted: 'h-9 pl-4 pr-1 text-meta gap-2.5', icon: 'size-9', dot: 'size-7' },
  md: { pill: 'h-11 px-5 text-body gap-2', dotted: 'h-11 pl-5 pr-1.5 text-body gap-3', icon: 'size-11', dot: 'size-8' },
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string, dotted = false) {
  const s = sizes[size];
  return cx(
    'pressable roll-host inline-flex shrink-0 items-center justify-center rounded-pill border font-semibold whitespace-nowrap select-none',
    'disabled:cursor-not-allowed disabled:opacity-55',
    variants[variant],
    variant === 'icon' ? s.icon : dotted ? s.dotted : s.pill,
    variant === 'ghost' && 'px-1',
    className,
  );
}

/** Label with the text roll: on hover the word slides up and a copy follows. Only for plain text labels. */
export function RollLabel({ children }: { children: ReactNode }) {
  if (typeof children !== 'string') return <>{children}</>;
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

/** The paper dot that holds an arrow or a plus on the right of a primary pill. */
export function Dot({ children, size = 'md' }: { children: ReactNode; size?: ButtonSize }) {
  return (
    <span aria-hidden className={cx('roll-dot grid shrink-0 place-items-center rounded-pill bg-paper text-ink', sizes[size].dot)}>
      {children}
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, dot, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const dotted = Boolean(dot) && (variant === 'primary' || variant === 'go');
  const spinner = <Loader2 aria-hidden className="spin size-4" />;
  const hasLabel = children !== undefined && children !== null && children !== false;
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className, dotted)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {variant === 'icon' ? (
        loading ? (
          spinner
        ) : (
          icon
        )
      ) : (
        <>
          {dotted ? null : loading ? spinner : icon}
          {hasLabel ? variant === 'ghost' ? children : <RollLabel>{children}</RollLabel> : null}
          {dotted ? <Dot size={size}>{loading ? spinner : dot}</Dot> : null}
        </>
      )}
    </button>
  );
});
