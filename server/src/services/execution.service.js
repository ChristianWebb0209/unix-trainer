import { ContainerService } from './container.service.js';
import { ValidationService, ComparisonStrategy } from './validation.service.js';
import { ProblemService } from './problem.service.js';
import { ExecutionStatus } from '../types/execution.types.js';
import { Visibility } from '../types/problem.types.js';

/**
 * Execution Service
 * -----------------
 * Orchestrates running user submissions against test cases.
 *
 * Responsibilities:
 * - Accept submission request
 * - Request container from ContainerService
 * - Execute compiled/interpreted code
 * - Capture stdout, stderr, exit codes
 * - Measure runtime + memory usage
 * - Return structured execution result
 *
 * Must NOT:
 * - Validate correctness of output
 * - Parse problem definitions
 *
 * Depends on:
 * - ContainerService
 * - ValidationService
 * - ProblemService
 *
 * Design constraints:
 * - Stateless
 * - Idempotent execution
 * - Must support parallel runs safely
 *
 * Implementation notes:
 * - Use streaming logs if possible
 * - Fail gracefully and always clean up containers
 */
export class ExecutionService {
    constructor(containerService, validationService, problemService) {
        this.containerService = containerService;
        this.validationService = validationService;
        this.problemService = problemService;
    }

    /**
     * Executes a user submission against all test cases for a given problem.
     * @param {string} problemId The ID of the problem being solved.
     * @param {object} request The execution request containing code and limits.
     * @returns {Promise<object>} A promise that resolves to the final ExecutionResult.
     */
    async executeSubmission(problemId, request) {
        // Use existing container if provided, otherwise create a new one
        let containerId = request.containerId || null;
        let shouldDestroyContainer = !request.containerId;

        try {
            // 1. Fetch test cases (including hidden for full grading)
            const testCases = this.problemService.getTestCases(problemId, Visibility.HIDDEN);

            if (testCases.length === 0) {
                return {
                    status: ExecutionStatus.INTERNAL_ERROR,
                    stdout: '',
                    stderr: '',
                    error: `No test cases found for problem ID: ${problemId}`,
                    usage: { timeMs: 0, memoryBytes: 0 }
                };
            }

            // 2. Request a container only if not provided
            if (!containerId) {
                containerId = await this.containerService.createContainer({
                    language: request.language,
                    memoryLimitBytes: request.memoryLimitBytes,
                    timeLimitMs: request.timeLimitMs
                });
            }

            // 3. Compile code if necessary (Mocked for now)
            // In a real environment, we'd compile C++/Java here and catch COMPILATION_ERROR.

            // 4. Run code against all test cases
            const actualOutputs = [];
            let maxTimeMs = 0;
            let maxMemoryBytes = 0;
            let executionStatus = ExecutionStatus.SUCCESS;
            let overallStdout = '';
            let overallStderr = '';

            for (const testCase of testCases) {
                // In a real implementation we would write the code to a file inside the container
                // and pass testCase.input to stdin.
                const runCommand = `run-${request.language}`;

                try {
                    const result = await this.containerService.run(containerId, runCommand, testCase.input, request.code, request.language);

                    actualOutputs.push(result.stdout);
                    maxTimeMs = Math.max(maxTimeMs, result.timeMs);
                    maxMemoryBytes = Math.max(maxMemoryBytes, result.memoryBytes);

                    // Accumulate logs (in reality we might want to truncate or store per test case)
                    if (result.stdout) overallStdout += result.stdout + '\n';
                    if (result.stderr) overallStderr += result.stderr + '\n';

                    // Check resource limits
                    if (maxTimeMs > request.timeLimitMs) {
                        executionStatus = ExecutionStatus.TIME_LIMIT_EXCEEDED;
                        break;
                    }
                    if (maxMemoryBytes > request.memoryLimitBytes) {
                        executionStatus = ExecutionStatus.MEMORY_LIMIT_EXCEEDED;
                        break;
                    }

                    // Check for runtime errors
                    if (result.exitCode !== 0) {
                        executionStatus = ExecutionStatus.RUNTIME_ERROR;
                        break;
                    }

                } catch (err) {
                    executionStatus = ExecutionStatus.INTERNAL_ERROR;
                    overallStderr += `\nInternal error running test case: ${err.message}`;
                    break;
                }
            }

            // 5. Validation
            const verdict = this.validationService.validate(
                actualOutputs,
                testCases,
                ComparisonStrategy.EXACT, // Could be determined by problem metadata in a full implementation
                executionStatus
            );

            // 6. Return structured result
            return {
                status: verdict.verdict,
                stdout: overallStdout,
                stderr: overallStderr,
                error: verdict.reason,
                usage: {
                    timeMs: maxTimeMs,
                    memoryBytes: maxMemoryBytes
                }
            };

        } catch (error) {
            return {
                status: ExecutionStatus.INTERNAL_ERROR,
                stdout: '',
                stderr: '',
                error: `Service error: ${error.message}`,
                usage: { timeMs: 0, memoryBytes: 0 }
            };
        } finally {
            // 7. Cleanup only if we created the container
            if (containerId && shouldDestroyContainer) {
                await this.containerService.destroy(containerId);
            }
        }
    }
}
