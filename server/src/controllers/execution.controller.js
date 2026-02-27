import { ExecutionService } from '../services/execution.service.js';

/**
 * Execution Controller
 * --------------------
 * Entry point for code execution requests.
 *
 * Responsibilities:
 * - Accept execution payload
 * - Call ExecutionService
 * - Return execution results
 *
 * Must NOT:
 * - Validate outputs
 * - Spawn containers
 *
 * Depends on:
 * - ExecutionService
 *
 * Response contract:
 * {
 *   status,
 *   result,
 *   metrics,
 *   error?
 * }
 *
 * Design constraints:
 * - Stateless
 * - Idempotent requests
 */
export class ExecutionController {
    constructor(executionService) {
        this.executionService = executionService;
    }

    async executeSubmission(req, res) {
        try {
            const { problemId } = req.params;
            const { code, language } = req.body;

            if (!problemId) {
                res.status(400).json({ error: 'Problem ID is required' });
                return;
            }

            if (!code || !language) {
                res.status(400).json({ error: 'Code and language are required in the request body' });
                return;
            }

            const { EXECUTION_DEFAULTS, ALLOWED_LANGUAGES } = await import('../config/execution.config.js');
            const candidateLang = typeof language === 'string' ? language.toLowerCase() : '';
            const safeLanguage = ALLOWED_LANGUAGES.includes(candidateLang) ? candidateLang : EXECUTION_DEFAULTS.language;

            const timeLimitMs = EXECUTION_DEFAULTS.timeLimitMs;
            const memoryLimitBytes = EXECUTION_DEFAULTS.memoryLimitBytes;

            const executionRequest = {
                code,
                language: safeLanguage,
                input: '', // Could be mapped from request if needed, but handled internally per testcase usually
                timeLimitMs,
                memoryLimitBytes
            };

            const result = await this.executionService.executeSubmission(problemId, executionRequest);

            // Shape response according to the contract
            const error = result.status === 'SUCCESS' ? null : result.error;
            res.status(200).json({
                status: result.status,
                result: { stdout: result.stdout, stderr: result.stderr },
                metrics: result.usage,
                error
            });
        } catch (error) {
            console.error('[ExecutionController] Error executing submission:', error);
            res.status(500).json({ error: 'Internal server error while executing submission' });
        }
    }
}
