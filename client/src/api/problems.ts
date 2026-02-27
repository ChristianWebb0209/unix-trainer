export type Difficulty = "easy" | "medium" | "hard";
export type ProblemType = "unix" | "awk" | "bash";

export interface ProblemSummary {
    id: string;
    title: string;
    description: string;
    difficulty: Difficulty;
    type: ProblemType;
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
    type?: ProblemType;
    page?: number;
    limit?: number;
}

export async function listProblems(params: ListProblemsParams): Promise<ListProblemsResponse> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.difficulty) searchParams.set("difficulty", params.difficulty);
    if (params.type) searchParams.set("type", params.type);
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
