import type { Difficulty, ProblemLanguage } from "problem-config";

export type { Difficulty, ProblemLanguage };

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
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.difficulty) searchParams.set("difficulty", params.difficulty);
    if (params.language && params.language !== "all") searchParams.set("type", params.language);
    if (params.languageIn?.length) searchParams.set("languageIn", params.languageIn.join(","));
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    const url = query ? `http://localhost:3000/api/problems?${query}` : "http://localhost:3000/api/problems";

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch problems: ${res.status}`);
    }
    return res.json();
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

