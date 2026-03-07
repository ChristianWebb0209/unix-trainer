import * as problemConfig from "problem-config";

/** Difficulty level for problems. Derived from problem-config. */
export type Difficulty = (typeof problemConfig.DIFFICULTIES)[number];
/** Problem language id. Derived from problem-config. */
export type ProblemLanguage = (typeof problemConfig.PROBLEM_LANGUAGE_IDS)[number];

export interface ProblemSummary {
    id: string;
    title: string;
    difficulty: Difficulty;
    language: ProblemLanguage;
}

export interface ListProblemsResponse {
    problems: ProblemSummary[];
    total: number;
    page: number;
    limit: number;
}

export interface ListProblemsParams {
    search?: string;
    difficulty?: Difficulty;
    language?: ProblemLanguage | "all";
    /** Restrict results to these languages (server filter). Used e.g. by workspace to show only relevant problems. */
    languageIn?: ProblemLanguage[];
    page?: number;
    limit?: number;
}

const PROBLEMS_LIST_CACHE_PREFIX = "problems_list_v1_";
const MEMORY_TTL_MS = 5 * 60 * 1000;   // 5 min
const STORAGE_TTL_MS = 30 * 60 * 1000;  // 30 min
const MAX_STORAGE_KEYS = 50;

function canonicalCacheKey(p: ListProblemsParams): string {
    const o: Record<string, string | number | string[] | undefined> = {
        search: p.search,
        difficulty: p.difficulty,
        language: p.language,
        languageIn: p.languageIn?.length ? p.languageIn.slice().sort().join(",") : undefined,
        page: p.page ?? 1,
        limit: p.limit ?? 50,
    };
    return JSON.stringify(o);
}

function getStorageKeys(): string[] {
    const keys: string[] = [];
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k?.startsWith(PROBLEMS_LIST_CACHE_PREFIX)) keys.push(k);
        }
    } catch {
        // ignore
    }
    return keys;
}

function pruneStorageIfNeeded(): void {
    try {
        const keys = getStorageKeys();
        if (keys.length <= MAX_STORAGE_KEYS) return;
        const withTs: { key: string; ts: number }[] = [];
        for (const k of keys) {
            const raw = window.localStorage.getItem(k);
            if (!raw) continue;
            try {
                const { ts } = JSON.parse(raw) as { ts: number };
                withTs.push({ key: k, ts });
            } catch {
                withTs.push({ key: k, ts: 0 });
            }
        }
        withTs.sort((a, b) => a.ts - b.ts);
        const toRemove = withTs.length - MAX_STORAGE_KEYS;
        for (let i = 0; i < toRemove; i++) {
            window.localStorage.removeItem(withTs[i].key);
        }
    } catch {
        // ignore
    }
}

const memoryCache = new Map<string, { data: ListProblemsResponse; ts: number }>();

export interface ProblemOfTheDay {
    id: string;
    title: string;
    instructions: string;
    difficulty: Difficulty;
    language: ProblemLanguage;
}

export type ProblemCompletionState = "attempted" | "completed";

export interface ProblemCompletion {
    id: string;
    user_id: string;
    problem_id: string;
    solution_code: string;
    language: ProblemLanguage | string;
    completed_at: string | null;
}

export async function listProblems(params: ListProblemsParams): Promise<ListProblemsResponse> {
    const cacheKey = canonicalCacheKey(params);
    const now = Date.now();

    const cached = memoryCache.get(cacheKey);
    if (cached && now - cached.ts < MEMORY_TTL_MS) {
        return cached.data;
    }

    if (typeof window !== "undefined" && window.localStorage) {
        try {
            const raw = window.localStorage.getItem(PROBLEMS_LIST_CACHE_PREFIX + cacheKey);
            if (raw) {
                const { data, ts } = JSON.parse(raw) as { data: ListProblemsResponse; ts: number };
                if (now - ts < STORAGE_TTL_MS) {
                    memoryCache.set(cacheKey, { data, ts });
                    return data;
                }
            }
        } catch {
            // ignore
        }
    }

    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.difficulty) searchParams.set("difficulty", params.difficulty);
    if (params.language && params.language !== "all") searchParams.set("type", params.language);
    if (params.languageIn?.length) searchParams.set("languageIn", params.languageIn.join(","));
    if (params.page) searchParams.set("page", (params.page ?? 1).toString());
    if (params.limit) searchParams.set("limit", (params.limit ?? 50).toString());

    const query = searchParams.toString();
    const url = query ? `/api/problems?${query}` : "/api/problems";

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch problems: ${res.status}`);
    }
    const data = (await res.json()) as ListProblemsResponse;

    memoryCache.set(cacheKey, { data, ts: now });
    if (typeof window !== "undefined" && window.localStorage) {
        try {
            window.localStorage.setItem(
                PROBLEMS_LIST_CACHE_PREFIX + cacheKey,
                JSON.stringify({ data, ts: now })
            );
            pruneStorageIfNeeded();
        } catch {
            // ignore quota or other errors
        }
    }

    return data;
}

export async function getProblemOfTheDay(): Promise<ProblemOfTheDay> {
    const res = await fetch("http://localhost:3000/api/problems/of-the-day");
    if (!res.ok) {
        throw new Error(`Failed to fetch problem of the day: ${res.status}`);
    }
    const data = await res.json();
    return data.problem as ProblemOfTheDay;
}

export async function fetchProblemCompletions(userId: string): Promise<ProblemCompletion[]> {
    const params = new URLSearchParams();
    params.set("userId", userId);
    const res = await fetch(`/api/completions?${params.toString()}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch problem completions: ${res.status}`);
    }
    const data = await res.json();
    return (data?.completions ?? []) as ProblemCompletion[];
}

export interface SaveProblemProgressInput {
    userId: string;
    problemId: string;
    solutionCode: string;
    language: string;
    completed?: boolean;
}

export async function saveProblemProgress(input: SaveProblemProgressInput): Promise<ProblemCompletion> {
    const res = await fetch("/api/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
    });
    if (!res.ok) {
        throw new Error(`Failed to save problem progress: ${res.status}`);
    }
    const data = await res.json();
    return data.completion as ProblemCompletion;
}

import type { ValidationResult } from "../types/validation";

export interface ValidateProblemParams {
    solutionCode: string;
    containerId: string | null;
    language: string;
    /** For webgpu_numeric: client-run output per test (e.g. center pixel [r,g,b]). */
    testOutputs?: Array<{ testId: string; values: number[] }>;
}

export async function validateProblem(problemId: string, params: ValidateProblemParams): Promise<ValidationResult> {
    const res = await fetch(`/api/problems/${problemId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            solutionCode: params.solutionCode,
            containerId: params.containerId,
            language: params.language,
            testOutputs: params.testOutputs ?? undefined,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Validation failed: ${res.status}`);
    }
    return res.json() as Promise<ValidationResult>;
}

