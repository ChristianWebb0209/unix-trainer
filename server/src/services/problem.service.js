import { Visibility } from '../types/problem.types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    // In a real application, this would be a database connection.
    // We'll use a static in-memory store for this implementation.
    constructor(initialProblems = []) {
        this.problems = new Map();
        for (const problem of initialProblems) {
            this.problems.set(problem.id, problem);
        }
        this.loadProblemsFromData();
    }

    /**
     * Loads problem JSON files from the data/problems directory into the in-memory store.
     */
    loadProblemsFromData() {
        const dataDir = path.resolve(__dirname, '../data/problems');
        if (!fs.existsSync(dataDir)) {
            console.warn(`[ProblemService] Data directory not found: ${dataDir}`);
            return;
        }
        const files = this.collectJsonFiles(dataDir);
        for (const filePath of files) {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.problems)) {
                    const inferredDifficulty = this.inferDifficulty(filePath);
                    const inferredType = this.inferType(filePath);
                    for (const prob of parsed.problems) {
                        // Ensure required fields exist, add defaults if missing
                        const enriched = {
                            ...prob,
                            difficulty: prob.difficulty ?? inferredDifficulty ?? 'easy',
                            type: prob.type ?? inferredType ?? 'unix',
                            constraint: prob.constraint ?? { timeLimitMs: 5000, memoryLimitBytes: 256 * 1024 * 1024 },
                            visibility: prob.visibility ?? 'public',
                            testCases: prob.tests?.map((t) => ({
                                id: t.id ?? `${prob.id}_tc_${Math.random().toString(36).substr(2, 5)}`,
                                input: t.input,
                                expected_stdout: t.expected_stdout,
                                setup_files: t.setup_files,
                                cwd: t.cwd,
                                files: t.files,
                                isHidden: t.isHidden ?? false
                            })) ?? []
                        };
                        this.problems.set(enriched.id, enriched);
                    }
                }
            } catch (e) {
                console.error(`[ProblemService] Failed to load ${filePath}:`, e);
            }
        }
    }

    collectJsonFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...this.collectJsonFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }
        return files;
    }

    inferDifficulty(filePath) {
        const lower = filePath.toLowerCase();
        if (lower.includes(`${path.sep}easy${path.sep}`)) return 'easy';
        if (lower.includes(`${path.sep}medium${path.sep}`)) return 'medium';
        if (lower.includes(`${path.sep}hard${path.sep}`)) return 'hard';
        return null;
    }

    inferType(filePath) {
        const base = path.basename(filePath).toLowerCase();
        if (base.includes('awk')) return 'awk';
        if (base.includes('bash')) return 'bash';
        if (base.includes('unix')) return 'unix';
        return null;
    }

    /**
     * Retrieves a problem by its ID.
     * @param {string} problemId The ID of the problem to retrieve.
     * @returns {object|null} The problem metadata and formulation, or null if not found.
     */
    getProblem(problemId) {
        return this.problems.get(problemId) || null;
    }

    /**
     * Retrieves test cases for a problem, optionally filtering out hidden ones.
     * @param {string} problemId The ID of the problem.
     * @param {string} visibility Limit to PUBLIC or return both (HIDDEN assumes full access, e.g., during execution).
     * @returns {Array} An array of test cases. Never returns null; returns empty array if problem missing.
     */
    getTestCases(problemId, visibility) {
        const problem = this.problems.get(problemId);
        if (!problem) {
            return [];
        }

        if (visibility === Visibility.PUBLIC) {
            // Only return test cases that are strictly NOT hidden.
            return problem.testCases.filter((tc) => !tc.isHidden);
        }
        // Context requests HIDDEN, meaning we provide all test cases including hidden ones.
        return [...problem.testCases];
    }

    /**
     * Returns a list of problems with optional filtering and pagination.
     * @param {object} filters Object containing optional search, difficulty, and type filters.
     * @param {object} pagination Object containing page (1-indexed) and limit.
     */
    listProblems(filters, pagination) {
        let results = Array.from(this.problems.values());
        if (filters.search) {
            const lower = filters.search.toLowerCase();
            results = results.filter(p => p.title.toLowerCase().includes(lower) || p.id.toLowerCase().includes(lower));
        }
        if (filters.difficulty) {
            results = results.filter(p => p.difficulty === filters.difficulty);
        }
        if (filters.type) {
            results = results.filter(p => p.type === filters.type);
        }
        const total = results.length;
        const start = (pagination.page - 1) * pagination.limit;
        const end = start + pagination.limit;
        const paged = results.slice(start, end);
        return { problems: paged, total, page: pagination.page, limit: pagination.limit };
    }
}
