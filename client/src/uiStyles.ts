import type { Difficulty } from "./api/problems";

/** Single source for rounded control radius; match pill style (999px) so one change updates everywhere. */
export const UNIFIED_RADIUS = "999px";

export const primaryPillSelected = {
    padding: "0.2rem 0.7rem",
    fontSize: "0.8rem",
    borderRadius: "999px",
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--accent-color)",
    color: "var(--button-text)",
} as const;

export const primaryPillUnselected = {
    padding: "0.2rem 0.7rem",
    fontSize: "0.8rem",
    borderRadius: "999px",
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
} as const;

/** Shared style for text inputs (search, etc.). */
export const unifiedInputStyle = {
    width: "100%" as const,
    padding: "0.4rem 0.5rem",
    borderRadius: UNIFIED_RADIUS,
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: "0.9rem",
    boxSizing: "border-box" as const,
};

/** Shared style for select trigger and dropdown options (custom select). */
export const unifiedSelectTriggerStyle = {
    padding: "0.35rem 0.6rem",
    borderRadius: UNIFIED_RADIUS,
    border: "1px solid var(--border-color)",
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: "0.8rem",
    cursor: "pointer" as const,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: "0.35rem",
    minHeight: "28px",
    boxSizing: "border-box" as const,
};

/** Style for dropdown option rows (same radius as trigger). */
export const unifiedDropdownOptionStyle = {
    padding: "0.35rem 0.6rem",
    borderRadius: UNIFIED_RADIUS,
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: "0.8rem",
    cursor: "pointer" as const,
    width: "100%" as const,
    textAlign: "left" as const,
    marginBottom: "0.2rem",
};

/** Shared style for secondary buttons (e.g. Open Playground). */
export const unifiedButtonStyle = {
    width: "100%" as const,
    padding: "0.5rem 0.75rem",
    borderRadius: UNIFIED_RADIUS,
    border: "1px solid var(--border-color)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: "0.9rem",
    cursor: "pointer" as const,
    textAlign: "center" as const,
};

export const DIFFICULTY_TAG_STYLES: Record<Difficulty, { bg: string; text: string }> = {
    learn: { bg: "var(--badge-learn-bg)", text: "var(--badge-learn-text)" },
    easy: { bg: "var(--badge-easy-bg)", text: "var(--badge-easy-text)" },
    medium: { bg: "var(--badge-medium-bg)", text: "var(--badge-medium-text)" },
    hard: { bg: "var(--badge-hard-bg)", text: "var(--badge-hard-text)" },
};

