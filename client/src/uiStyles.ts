import type { Difficulty } from "./api/problems";

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

export const DIFFICULTY_TAG_STYLES: Record<Difficulty, { bg: string; text: string }> = {
    learn: { bg: "var(--badge-learn-bg)", text: "var(--badge-learn-text)" },
    easy: { bg: "var(--badge-easy-bg)", text: "var(--badge-easy-text)" },
    medium: { bg: "var(--badge-medium-bg)", text: "var(--badge-medium-text)" },
    hard: { bg: "var(--badge-hard-bg)", text: "var(--badge-hard-text)" },
};

