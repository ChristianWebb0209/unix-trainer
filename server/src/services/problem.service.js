import { Visibility } from '../types/problem.types.js';
import { supabaseAdmin } from '../config/supabase.config.js';
import { getLocalProblem, listLocalProblems } from './local-problems.js';
import { compareProblems, getAvailableLanguageIds } from '../../../problem-config.mjs';

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
            return getLocalProblem(problemId);
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
            const local = getLocalProblem(problemId);
            const localTests = Array.isArray(local?.tests) ? local.tests : [];
            return visibility === Visibility.PUBLIC
                ? localTests.filter((tc) => !tc.isHidden)
                : localTests;
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
            return this.#listLocal(filters, pagination);
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

        const problems = (data ?? [])
            .map((p) => ({
                ...p,
                starterCode: p.starter_code ?? null,
            }))
            .sort(compareProblems);

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
        let all;
        if (!supabaseAdmin) {
            all = listLocalProblems();
        } else {
            const { data, error } = await supabaseAdmin
                .from('problems')
                .select('id,title,instructions,difficulty,language,tests,starter_code');

            if (error) {
                console.error('[ProblemService] Failed to fetch problems for problem of the day:', error.message);
                return null;
            }
            all = Array.isArray(data) ? data : [];
        }

        if (all.length === 0) {
            return null;
        }

        // Never feature a problem in a language no workspace can run.
        const available = new Set(getAvailableLanguageIds());
        all = all.filter((p) => available.has(String(p.language).toLowerCase()));
        if (all.length === 0) return null;

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

    /**
     * Filesystem-backed equivalent of listProblems(). Applies the same filters and
     * pagination so callers cannot tell which source answered.
     * @param {object} filters
     * @param {{ page: number, limit: number }} pagination
     */
    #listLocal(filters, pagination) {
        let rows = listLocalProblems();

        if (filters.search) {
            const term = String(filters.search).toLowerCase();
            rows = rows.filter(
                (p) => p.id.toLowerCase().includes(term) || p.title.toLowerCase().includes(term)
            );
        }
        if (filters.difficulty) {
            rows = rows.filter((p) => p.difficulty === filters.difficulty);
        }
        if (filters.type) {
            rows = rows.filter((p) => p.language === filters.type);
        }
        if (Array.isArray(filters.languageIn) && filters.languageIn.length > 0) {
            rows = rows.filter((p) => filters.languageIn.includes(p.language));
        }

        const total = rows.length;
        const from = (pagination.page - 1) * pagination.limit;
        return {
            problems: rows.slice(from, from + pagination.limit),
            total,
            page: pagination.page,
            limit: pagination.limit,
        };
    }

    // syncProblemToDatabase removed: Supabase is the source of truth when configured;
    // otherwise problems are served from src/data/problems/*.json (see local-problems.js).
}
