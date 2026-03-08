import { Visibility } from '../types/problem.types.js';
import { supabaseAdmin } from '../config/supabase.config.js';

/**
 * Problem Service
 * ---------------
 * Source of truth for coding problems and their test cases.
 *
 * Responsibilities:
 * - Fetch problem metadata
 * - Retrieve input/output test cases
 * - Provide constraints (time limits, memory limits)
 * - Support hidden vs public test cases
 *
 * Must NOT:
 * - Execute code
 * - Validate submissions
 *
 * Data Sources:
 * - Database or static problem store
 *
 * Required API:
 * - getProblem(problemId)
 * - getTestCases(problemId, visibility)
 *
 * Implementation requirements:
 * - Must be cacheable
 * - Must be deterministic
 * - Must not mutate stored problems
 */
export class ProblemService {
    constructor(initialProblems = []) {
        this.problems = new Map();
        for (const problem of initialProblems) {
            this.problems.set(problem.id, problem);
        }
    }

    // JSON loading removed; problems are now sourced from Supabase.

    /**
     * Retrieves a problem by its ID.
     * @param {string} problemId The ID of the problem to retrieve.
     * @returns {object|null} The problem metadata and formulation, or null if not found.
     */
    async getProblem(problemId) {
        if (!supabaseAdmin) {
            console.error('[ProblemService] supabaseAdmin is not configured');
            return null;
        }
        const { data, error } = await supabaseAdmin
            .from('problems')
            .select('id,title,instructions,solution,difficulty,language,tests,starter_code')
            .eq('id', problemId)
            .single();
        if (error) {
            console.error('[ProblemService] Failed to fetch problem from Supabase:', error.message);
            return null;
        }
        return {
            ...data,
            starterCode: data.starter_code ?? null,
            solution: data.solution ?? null,
        };
    }

    /**
     * Retrieves test cases for a problem, optionally filtering out hidden ones.
     * @param {string} problemId The ID of the problem.
     * @param {string} visibility Limit to PUBLIC or return both (HIDDEN assumes full access, e.g., during execution).
     * @returns {Array} An array of test cases. Never returns null; returns empty array if problem missing.
     */
    async getTestCases(problemId, visibility) {
        if (!supabaseAdmin) {
            console.error('[ProblemService] supabaseAdmin is not configured');
            return [];
        }
        const { data, error } = await supabaseAdmin
            .from('problems')
            .select('tests')
            .eq('id', problemId)
            .single();
        if (error || !data) {
            console.error('[ProblemService] Failed to fetch tests from Supabase:', error?.message);
            return [];
        }
        const tests = Array.isArray(data.tests) ? data.tests : [];
        if (visibility === Visibility.PUBLIC) {
            return tests.filter((tc) => !tc.isHidden);
        }
        return tests;
    }

    /**
     * Returns a list of problems with optional filtering and pagination, backed by Supabase.
     * @param {object} filters Object containing optional search, difficulty, and type filters.
     * @param {object} pagination Object containing page (1-indexed) and limit.
     */
    async listProblems(filters, pagination) {
        if (!supabaseAdmin) {
            console.error('[ProblemService] supabaseAdmin is not configured');
            return { problems: [], total: 0, page: pagination.page, limit: pagination.limit };
        }

        let queryBuilder = supabaseAdmin
            .from('problems')
            .select('id,title,instructions,difficulty,language,tests,starter_code', { count: 'exact' });

        if (filters.search) {
            const term = `%${filters.search.toLowerCase()}%`;
            queryBuilder = queryBuilder.or(
                `id.ilike.${term},title.ilike.${term}`
            );
        }
        if (filters.difficulty) {
            queryBuilder = queryBuilder.eq('difficulty', filters.difficulty);
        }
        if (filters.type) {
            queryBuilder = queryBuilder.eq('language', filters.type);
        }
        if (filters.languageIn && Array.isArray(filters.languageIn) && filters.languageIn.length > 0) {
            queryBuilder = queryBuilder.in('language', filters.languageIn);
        }

        const from = (pagination.page - 1) * pagination.limit;
        const to = from + pagination.limit - 1;
        const { data, error, count } = await queryBuilder
            .order('difficulty', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            console.error('[ProblemService] Failed to list problems from Supabase:', error.message);
            return { problems: [], total: 0, page: pagination.page, limit: pagination.limit };
        }

        const difficultyOrder = { learn: 0, easy: 1, medium: 2, hard: 3 };
        const problems = (data ?? [])
            .map((p) => ({
                ...p,
                starterCode: p.starter_code ?? null,
            }))
            .sort((a, b) => {
                const da = difficultyOrder[a.difficulty] ?? 99;
                const db = difficultyOrder[b.difficulty] ?? 99;
                if (da !== db) return da - db;
                return String(a.id).localeCompare(String(b.id));
            });

        return {
            problems,
            total: count ?? problems.length,
            page: pagination.page,
            limit: pagination.limit,
        };
    }

    /**
     * Deterministically selects a "problem of the day" based on the current date.
     * Backed by Supabase problems table.
     */
    async getProblemOfTheDay(currentDate = new Date()) {
        if (!supabaseAdmin) {
            console.error('[ProblemService] supabaseAdmin is not configured');
            return null;
        }

        const { data, error } = await supabaseAdmin
            .from('problems')
            .select('id,title,instructions,difficulty,language,tests,starter_code');

        if (error) {
            console.error('[ProblemService] Failed to fetch problems for problem of the day:', error.message);
            return null;
        }

        const all = Array.isArray(data) ? data : [];
        if (all.length === 0) {
            return null;
        }

        // Stable order so the same date always maps to the same problem
        all.sort((a, b) => a.id.localeCompare(b.id));

        const dateKey = currentDate.toISOString().slice(0, 10); // YYYY-MM-DD
        let hash = 0;
        for (let i = 0; i < dateKey.length; i++) {
            hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
        }
        const index = hash % all.length;
        const chosen = all[index];

        return {
            ...chosen,
            starterCode: chosen.starter_code ?? null,
        };
    }

    // syncProblemToDatabase removed: Supabase is now the primary source of truth.
}
