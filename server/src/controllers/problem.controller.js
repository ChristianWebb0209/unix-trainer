import { ProblemService } from '../services/problem.service.js';
import { Visibility } from '../types/problem.types.js';

/**
 * Problem Controller
 * ------------------
 * Handles HTTP requests for problem retrieval.
 *
 * Responsibilities:
 * - Fetch problem data via ProblemService
 * - Return public test cases when allowed
 * - Handle missing problems gracefully
 *
 * Must NOT:
 * - Contain problem logic
 * - Validate submissions
 *
 * Requirements:
 * - Must support pagination if listing problems
 * - Must return consistent API structure
 *
 * Agent instructions:
 * - Always sanitize outgoing data
 * - Never leak hidden test cases unless requested internally
 */
export class ProblemController {
    constructor(problemService) {
        this.problemService = problemService;
    }

    /**
     * Gets a single problem by ID, returning metadata and public test cases.
     */
    async getProblem(req, res) {
        try {
            const problemIdParam = req.params.problemId;
            const problemId = Array.isArray(problemIdParam) ? problemIdParam[0] : problemIdParam;

            if (!problemId) {
                res.status(400).json({ error: 'Problem ID is required' });
                return;
            }

            const problem = await this.problemService.getProblem(problemId);
            if (!problem) {
                res.status(404).json({ error: `Problem with ID ${problemId} not found` });
                return;
            }

            // Only fetch public test cases for the API response to prevent leaking hidden ones
            const publicTestCases = await this.problemService.getTestCases(problemId, Visibility.PUBLIC);

            // Construct sanitized response aligned with the new problem schema
            const sanitizedProblem = {
                id: problem.id,
                title: problem.title,
                instructions: problem.instructions,
                difficulty: problem.difficulty,
                language: problem.language ?? problem.type ?? 'any',
                starterCode: problem.starterCode ?? null,
                tests: publicTestCases.map((tc) => ({
                    input: tc.input,
                    expected_stdout: tc.expected_stdout,
                })),
            };

            res.status(200).json({ problem: sanitizedProblem });
        } catch (error) {
            console.error(`[ProblemController] Error fetching problem:`, error);
            res.status(500).json({ error: 'Internal server error while fetching problem' });
        }
    }

    /**
     * Lists problems with pagination support.
     */
    async listProblems(req, res) {
        try {
            // Parse query parameters
            const search = typeof req.query.search === 'string' ? req.query.search : undefined;
            const difficultyRaw = typeof req.query.difficulty === 'string' ? req.query.difficulty : undefined;
            const typeRaw = typeof req.query.type === 'string' ? req.query.type : undefined;
            const page = parseInt((req.query.page) || '1', 10) || 1;
            const limit = parseInt((req.query.limit) || '10', 10) || 10;

            // Build filters object without undefined properties to satisfy exactOptionalPropertyTypes
            const filters = {};
            if (search) filters.search = search;
            if (difficultyRaw) {
                const normalized = difficultyRaw.toLowerCase();
                if (['learn', 'easy', 'medium', 'hard'].includes(normalized)) {
                    filters.difficulty = normalized;
                }
            }
            if (typeRaw) {
                const normalized = typeRaw.toLowerCase();
                if (['unix', 'awk', 'bash', 'cuda'].includes(normalized)) {
                    filters.type = normalized;
                }
            }

            const result = await this.problemService.listProblems(filters, { page, limit });
            const sanitizedProblems = result.problems.map((problem) => ({
                id: problem.id,
                title: problem.title,
                difficulty: problem.difficulty,
                language: problem.language ?? problem.type ?? 'any',
            }));
            res.status(200).json({
                problems: sanitizedProblems,
                total: result.total,
                page: result.page,
                limit: result.limit,
            });
        } catch (error) {
            console.error(`[ProblemController] Error listing problems:`, error);
            res.status(500).json({ error: 'Internal server error while listing problems' });
        }
    }

    /**
     * Returns the "problem of the day", selected once per calendar day.
     */
    async getProblemOfTheDay(req, res) {
        try {
            const problem = await this.problemService.getProblemOfTheDay(new Date());
            if (!problem) {
                res.status(404).json({ error: 'No problems available' });
                return;
            }

            const sanitized = {
                id: problem.id,
                title: problem.title,
                instructions: problem.instructions,
                difficulty: problem.difficulty,
                language: problem.language ?? problem.type ?? 'any',
            };

            res.status(200).json({ problem: sanitized });
        } catch (error) {
            console.error('[ProblemController] Error fetching problem of the day:', error);
            res.status(500).json({ error: 'Internal server error while fetching problem of the day' });
        }
    }
}
