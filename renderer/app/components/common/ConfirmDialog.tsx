"use client";

import React, { useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfirmDialogVariant = "danger" | "warning" | "info";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  /** Label for the confirm button. Default: "Confirm" */
  confirmLabel?: string;
  /** Label for the cancel button. Default: "Cancel" */
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  /** Show a loading spinner on the confirm button (e.g. while async op runs) */
  loading?: boolean;
  /** Called when user clicks Confirm */
  onConfirm: () => void;
  /** Called when user clicks Cancel or presses Escape */
  onCancel: () => void;
}

// ─── Variant config ───────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<
  ConfirmDialogVariant,
  { icon: string; iconColor: string; confirmClass: string }
> = {
  danger: {
    icon: "⚠",
    iconColor: "var(--color-error, #f85149)",
    confirmClass: "btn btn-danger",
  },
  warning: {
    icon: "⚠",
    iconColor: "var(--color-warning, #d29922)",
    confirmClass: "btn btn-primary",
  },
  info: {
    icon: "ℹ",
    iconColor: "var(--brand-primary, #D4A017)",
    confirmClass: "btn btn-primary",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const config = VARIANT_CONFIG[variant];

  // ── Focus management ──
  useEffect(() => {
    if (open) {
      // For danger, default focus on Cancel to prevent accidental confirm
      const target = variant === "danger" ? cancelBtnRef.current : confirmBtnRef.current;
      // Defer to let the DOM render
      const id = setTimeout(() => target?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open, variant]);

  // ── Escape key ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
      // Trap focus inside dialog
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    },
    [open, onCancel]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Body scroll lock ──
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay animate-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(3px)",
      }}
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) onCancel();
      }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div
        ref={dialogRef}
        className="modal card"
        style={{
          width: "100%",
          maxWidth: 440,
          borderRadius: 12,
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <span
            aria-hidden
            style={{
              fontSize: "1.25rem",
              color: config.iconColor,
              lineHeight: 1,
              flexShrink: 0,
              marginTop: "0.1rem",
            }}
          >
            {config.icon}
          </span>
          <div style={{ flex: 1 }}>
            <h3
              id="confirm-dialog-title"
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.3,
              }}
            >
              {title}
            </h3>
          </div>
          {/* Close ✕ */}
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close dialog"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "1.1rem",
              lineHeight: 1,
              padding: "0.1rem 0.25rem",
              flexShrink: 0,
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Message */}
        <div
          id="confirm-dialog-message"
          style={{
            fontSize: "0.875rem",
            color: "var(--text-secondary, var(--text-muted))",
            lineHeight: 1.6,
            paddingLeft: "2rem", // align with title (after icon)
          }}
        >
          {message}
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: "0.625rem",
            justifyContent: "flex-end",
            paddingTop: "0.25rem",
          }}
        >
          <button
            ref={cancelBtnRef}
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={config.confirmClass}
            onClick={onConfirm}
            disabled={loading}
            style={{ minWidth: 96 }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span
                  className="spinner"
                  style={{ width: 13, height: 13, borderWidth: 2 }}
                />
                Working…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hook: useConfirmDialog ───────────────────────────────────────────────────
/**
 * Convenience hook for imperative usage.
 *
 * Usage:
 *   const { dialogProps, confirm } = useConfirmDialog();
 *   // Trigger:
 *   const ok = await confirm({ title: "Delete?", message: "This is permanent." });
 *   if (ok) { ... }
 *   // Render anywhere:
 *   <ConfirmDialog {...dialogProps} />
 */

interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
}

interface UseConfirmDialogReturn {
  dialogProps: ConfirmDialogProps;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const [state, setState] = React.useState<{
    open: boolean;
    opts: ConfirmOptions;
    loading: boolean;
    resolve: ((v: boolean) => void) | null;
  }>({
    open: false,
    opts: { title: "", message: "" },
    loading: false,
    resolve: null,
  });

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, opts, loading: false, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state]);

  const dialogProps: ConfirmDialogProps = {
    open: state.open,
    title: state.opts.title,
    message: state.opts.message,
    confirmLabel: state.opts.confirmLabel,
    cancelLabel: state.opts.cancelLabel,
    variant: state.opts.variant,
    loading: state.loading,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { dialogProps, confirm };
}
