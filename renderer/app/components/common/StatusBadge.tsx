"use client";

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * WorkflowStatus mirrors the ReturnStatus enum in prisma/schema.prisma.
 * Extend here if new statuses are added to the schema.
 */
export type WorkflowStatus =
  | "NotStarted"
  | "DataCollection"
  | "InProgress"
  | "UnderReview"
  | "PendingApproval"
  | "Approved"
  | "Filed"
  | "Acknowledged"
  | "Defective"
  | "Revised"
  | "OnHold"
  | "Cancelled";

export type BadgeSize = "sm" | "md" | "lg";

interface StatusBadgeProps {
  status: WorkflowStatus;
  size?: BadgeSize;
  /** Show a small leading dot indicator */
  dot?: boolean;
  /** Override display label */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  /** Maps to badge-* modifier in globals.css */
  variant: "neutral" | "info" | "warning" | "brand" | "success" | "error";
  /** Accessible description for screen readers */
  description: string;
}

const STATUS_CONFIG: Record<WorkflowStatus, StatusConfig> = {
  NotStarted: {
    label: "Not Started",
    variant: "neutral",
    description: "Work has not begun on this return.",
  },
  DataCollection: {
    label: "Data Collection",
    variant: "info",
    description: "Client data is being gathered.",
  },
  InProgress: {
    label: "In Progress",
    variant: "info",
    description: "Return is actively being prepared.",
  },
  UnderReview: {
    label: "Under Review",
    variant: "warning",
    description: "Return is under internal review.",
  },
  PendingApproval: {
    label: "Pending Approval",
    variant: "warning",
    description: "Awaiting client or partner approval.",
  },
  Approved: {
    label: "Approved",
    variant: "brand",
    description: "Return has been approved and is ready to file.",
  },
  Filed: {
    label: "Filed",
    variant: "success",
    description: "Return has been filed with the income tax portal.",
  },
  Acknowledged: {
    label: "Acknowledged",
    variant: "success",
    description: "ITR-V acknowledgement received.",
  },
  Defective: {
    label: "Defective",
    variant: "error",
    description: "Return has been marked defective by the department.",
  },
  Revised: {
    label: "Revised",
    variant: "info",
    description: "A revised return has been filed.",
  },
  OnHold: {
    label: "On Hold",
    variant: "neutral",
    description: "Return is on hold pending further action.",
  },
  Cancelled: {
    label: "Cancelled",
    variant: "neutral",
    description: "Return has been cancelled.",
  },
};

// ─── Size config ──────────────────────────────────────────────────────────────

const SIZE_STYLES: Record<BadgeSize, React.CSSProperties> = {
  sm: { fontSize: "0.7rem", padding: "0.15rem 0.45rem", gap: "0.3rem" },
  md: { fontSize: "0.75rem", padding: "0.2rem 0.55rem", gap: "0.35rem" },
  lg: { fontSize: "0.8rem", padding: "0.3rem 0.7rem", gap: "0.4rem" },
};

const DOT_SIZE: Record<BadgeSize, number> = { sm: 5, md: 6, lg: 7 };

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatusBadge({
  status,
  size = "md",
  dot = false,
  label,
  className = "",
  style,
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: "neutral",
    description: status,
  };

  const displayLabel = label ?? config.label;
  const sizeStyle = SIZE_STYLES[size];
  const dotSize = DOT_SIZE[size];

  return (
    <span
      className={`badge badge-${config.variant} ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontWeight: 500,
        borderRadius: 999,
        whiteSpace: "nowrap",
        userSelect: "none",
        ...sizeStyle,
        ...style,
      }}
      title={config.description}
      aria-label={`Status: ${displayLabel} — ${config.description}`}
      role="status"
    >
      {dot && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            backgroundColor: "currentColor",
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
      )}
      {displayLabel}
    </span>
  );
}

// ─── Compound: StatusBadgeWithDate ────────────────────────────────────────────
// Convenience wrapper used in tables to show status + a secondary date string.

interface StatusBadgeWithDateProps extends StatusBadgeProps {
  date?: string | null;
  dateLabel?: string;
}

export function StatusBadgeWithDate({
  date,
  dateLabel = "Filed",
  ...badgeProps
}: StatusBadgeWithDateProps) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.2rem", alignItems: "flex-start" }}>
      <StatusBadge {...badgeProps} />
      {date && (
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {dateLabel}: {date}
        </span>
      )}
    </div>
  );
}

// ─── Utility: getStatusConfig (exported for other consumers) ──────────────────

export function getStatusConfig(status: WorkflowStatus): StatusConfig {
  return STATUS_CONFIG[status] ?? { label: status, variant: "neutral", description: status };
}

/**
 * Returns true for terminal statuses that should not allow further edits.
 */
export function isTerminalStatus(status: WorkflowStatus): boolean {
  return ["Filed", "Acknowledged", "Cancelled"].includes(status);
}

/**
 * Returns the natural next status in the workflow, or null if terminal.
 */
export function getNextStatus(status: WorkflowStatus): WorkflowStatus | null {
  const flow: Partial<Record<WorkflowStatus, WorkflowStatus>> = {
    NotStarted: "DataCollection",
    DataCollection: "InProgress",
    InProgress: "UnderReview",
    UnderReview: "PendingApproval",
    PendingApproval: "Approved",
    Approved: "Filed",
    Filed: "Acknowledged",
  };
  return flow[status] ?? null;
}
