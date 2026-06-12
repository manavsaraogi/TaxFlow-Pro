/**
 * shared/utils/panUtils.ts
 * PAN parsing, validation, and entity-type detection utilities.
 * Used in both Electron main process and renderer.
 * No runtime dependencies — pure functions only.
 */

import type { AssesseeType } from "../types/index";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PAN_LENGTH = 10;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * 4th character of PAN encodes the entity type per Income Tax Department rules.
 * https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1
 */
export const PAN_ENTITY_CHAR: Record<string, string> = {
  P: "Individual",
  H: "HUF",
  C: "Company",
  F: "Firm",
  A: "AOP / AJP",
  T: "Trust",
  B: "BOI",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government",
};

/**
 * Maps the PAN entity char to the nearest AssesseeType enum value.
 * Where there's ambiguity (e.g. "A" covers both AOP and AJP),
 * the most common type is returned; caller can override.
 */
const PAN_CHAR_TO_ASSESSEE_TYPE: Partial<Record<string, AssesseeType>> = {
  P: "Individual",
  H: "HUF",
  C: "Company_Domestic",
  F: "Firm",
  A: "AOP",
  T: "Trust",
  B: "BOI",
  L: "LocalAuthority",
  J: "AJP",
  G: "Individual", // Government entities — no direct match; default Individual
};

// ─── Core validation ──────────────────────────────────────────────────────────

/**
 * Returns true if the PAN string is structurally valid.
 * Accepts lowercase input (normalised internally).
 */
export function isValidPAN(pan: string | null | undefined): boolean {
  if (!pan) return false;
  return PAN_REGEX.test(pan.trim().toUpperCase());
}

/**
 * Normalise a PAN to uppercase with surrounding whitespace removed.
 * Does NOT validate format — use isValidPAN separately.
 */
export function normalisePAN(pan: string): string {
  return pan.trim().toUpperCase();
}

// ─── Entity detection ─────────────────────────────────────────────────────────

/**
 * Returns the raw entity label from the 4th character of the PAN.
 * e.g. "ABCDE1234F" → "Individual"
 * Returns null for invalid or unrecognised PANs.
 */
export function panEntityLabel(pan: string | null | undefined): string | null {
  if (!pan) return null;
  const upper = pan.trim().toUpperCase();
  if (upper.length < 4) return null;
  return PAN_ENTITY_CHAR[upper[3]] ?? null;
}

/**
 * Maps a PAN to the closest AssesseeType enum value.
 * Returns null if the PAN is invalid or entity char is unrecognised.
 *
 * Useful for auto-populating the Assessee Type field when a new PAN is entered.
 */
export function panToAssesseeType(pan: string | null | undefined): AssesseeType | null {
  if (!pan) return null;
  const upper = pan.trim().toUpperCase();
  if (!isValidPAN(upper)) return null;
  return PAN_CHAR_TO_ASSESSEE_TYPE[upper[3]] ?? null;
}

/**
 * Returns true if the PAN belongs to an Individual assessee (4th char = "P").
 */
export function isIndividualPAN(pan: string): boolean {
  return pan.trim().toUpperCase()[3] === "P";
}

/**
 * Returns true if the PAN belongs to a company (4th char = "C").
 */
export function isCompanyPAN(pan: string): boolean {
  return pan.trim().toUpperCase()[3] === "C";
}

// ─── Structural parsing ───────────────────────────────────────────────────────

export interface PANComponents {
  /** First 3 alphabetic chars — jurisdictional code */
  jurisdiction: string;
  /** 4th char — entity type identifier */
  entityChar: string;
  /** 5th char — first letter of surname / entity name */
  nameInitial: string;
  /** Chars 6–9 — sequential number */
  sequence: string;
  /** 10th char — alphabetical check character */
  checkChar: string;
  /** Resolved entity label, or null if unrecognised */
  entityLabel: string | null;
  /** Resolved AssesseeType, or null if unrecognised */
  assesseeType: AssesseeType | null;
}

/**
 * Decompose a PAN into its structural components.
 * Returns null if the PAN is invalid.
 *
 * PAN structure:
 * [AAA]   positions 1-3 — Jurisdictional Area Code (alpha)
 * [E]     position  4   — Entity type
 * [N]     position  5   — First letter of surname / name
 * [NNNN]  positions 6-9 — Sequential running number
 * [C]     position  10  — Alphabetical check digit
 */
export function parsePAN(pan: string | null | undefined): PANComponents | null {
  if (!pan) return null;
  const upper = pan.trim().toUpperCase();
  if (!isValidPAN(upper)) return null;

  return {
    jurisdiction: upper.slice(0, 3),
    entityChar:   upper[3],
    nameInitial:  upper[4],
    sequence:     upper.slice(5, 9),
    checkChar:    upper[9],
    entityLabel:  PAN_ENTITY_CHAR[upper[3]] ?? null,
    assesseeType: PAN_CHAR_TO_ASSESSEE_TYPE[upper[3]] ?? null,
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Format a PAN for readable display with space groupings.
 * e.g. "ABCDE1234F" → "ABCDE 1234 F"
 */
export function displayPAN(pan: string | null | undefined, fallback = "—"): string {
  if (!pan) return fallback;
  const upper = pan.trim().toUpperCase();
  if (upper.length !== PAN_LENGTH) return upper || fallback;
  return `${upper.slice(0, 5)} ${upper.slice(5, 9)} ${upper[9]}`;
}

/**
 * Mask a PAN for non-sensitive display.
 * e.g. "ABCDE1234F" → "ABCDE****F"
 */
export function maskPAN(pan: string | null | undefined, fallback = "—"): string {
  if (!pan) return fallback;
  const upper = pan.trim().toUpperCase();
  if (upper.length !== PAN_LENGTH) return fallback;
  return `${upper.slice(0, 5)}****${upper[9]}`;
}

/**
 * Returns true if two PANs refer to the same entity (case-insensitive).
 */
export function sameEntity(a: string, b: string): boolean {
  return normalisePAN(a) === normalisePAN(b);
}

// ─── Batch utilities ──────────────────────────────────────────────────────────

/**
 * Deduplicate a list of PAN strings (case-insensitive, preserving first occurrence).
 */
export function deduplicatePANs(pans: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const pan of pans) {
    const upper = normalisePAN(pan);
    if (!seen.has(upper)) {
      seen.add(upper);
      result.push(upper);
    }
  }
  return result;
}

/**
 * Filter a list of PANs to only those that are structurally valid.
 */
export function filterValidPANs(pans: string[]): string[] {
  return pans.map(normalisePAN).filter(isValidPAN);
}

/**
 * Group a list of PAN strings by their entity type.
 * Returns a map of entityLabel → PAN[].
 * Invalid PANs are grouped under "Unknown".
 */
export function groupByEntityType(pans: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const pan of pans) {
    const upper = normalisePAN(pan);
    const label = panEntityLabel(upper) ?? "Unknown";
    if (!groups[label]) groups[label] = [];
    groups[label].push(upper);
  }
  return groups;
}

// ─── TAN helpers (related — same format family) ───────────────────────────────

export const TAN_REGEX = /^[A-Z]{4}\d{5}[A-Z]$/;

/**
 * Returns true if the TAN string is structurally valid.
 * Format: 4 letters + 5 digits + 1 letter
 */
export function isValidTAN(tan: string | null | undefined): boolean {
  if (!tan) return false;
  return TAN_REGEX.test(tan.trim().toUpperCase());
}

/**
 * Normalise a TAN to uppercase.
 */
export function normaliseTAN(tan: string): string {
  return tan.trim().toUpperCase();
}

/**
 * Extract the 4-character bank/deductor area code from a TAN.
 */
export function tanAreaCode(tan: string): string {
  return tan.trim().toUpperCase().slice(0, 4);
}
