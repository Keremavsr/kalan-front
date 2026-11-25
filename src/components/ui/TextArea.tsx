import type { TextareaHTMLAttributes } from 'react';
import { FieldFrame, controlClass } from './Field';
import { cx } from '../../lib/cx';

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  fieldClassName?: string;
  labelHidden?: boolean;
}

/** The pill field's longer sibling: same ink edge and paper, card corners instead of a pill. */
export function TextAreaField({ label, hint, error, fieldClassName, labelHidden, className, rows = 8, ...rest }: TextAreaFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={fieldClassName} labelHidden={labelHidden}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cx(controlClass, 'h-auto resize-y rounded-card py-3 leading-relaxed', className)}
          {...rest}
        />
      )}
    </FieldFrame>
  );
}
