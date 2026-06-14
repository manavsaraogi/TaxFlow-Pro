'use client';

import { createContext, useContext } from 'react';

interface ValidationCtx {
  fieldErrors: Record<string, string>;
  fieldWarnings: Record<string, string>;
}

const ValidationContext = createContext<ValidationCtx>({ fieldErrors: {}, fieldWarnings: {} });

export const ValidationProvider = ValidationContext.Provider;

/** Returns the error message for a field key, or undefined if no error */
export function useFieldError(field: string): string | undefined {
  return useContext(ValidationContext).fieldErrors[field];
}

/** Returns the warning message for a field key, or undefined if no warning */
export function useFieldWarning(field: string): string | undefined {
  return useContext(ValidationContext).fieldWarnings[field];
}

/** Renders an inline error/warning below a field */
export function FieldMessage({ field }: { field: string }) {
  const err = useFieldError(field);
  const warn = useFieldWarning(field);
  if (err) return (
    <span style={{ display: 'block', fontSize: '11px', color: 'var(--error, #e05c4b)', marginTop: '2px', lineHeight: '1.3' }}>
      {err}
    </span>
  );
  if (warn) return (
    <span style={{ display: 'block', fontSize: '11px', color: 'var(--brand-text)', marginTop: '2px', lineHeight: '1.3' }}>
      {warn}
    </span>
  );
  return null;
}

/** Returns inline border style if field has an error */
export function useFieldBorderStyle(field: string): React.CSSProperties {
  const err = useFieldError(field);
  return err ? { borderColor: 'var(--error, #e05c4b)', borderWidth: '1px', borderStyle: 'solid' } : {};
}
