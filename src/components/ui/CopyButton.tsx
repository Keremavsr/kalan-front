import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from './Button';
import { useToast } from './Toast';

/**
 * Copies `text` to the clipboard; the icon turns into a tick for a moment and a toast says so.
 * The caller passes the toast texts so the shared namespaces stay untouched.
 */
export function CopyButton({
  text,
  label,
  done,
  failed,
  ...rest
}: Omit<ButtonProps, 'onClick'> & { text: string; label: string; done: string; failed: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.show(done, 'positive');
    } catch {
      toast.show(failed, 'negative');
    }
  }

  return (
    <Button
      variant="secondary"
      icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      onClick={() => void copy()}
      {...rest}
    >
      {label}
    </Button>
  );
}
