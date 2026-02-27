import { ExecutionStatus } from '../types/execution.types.js';

export const ComparisonStrategy = Object.freeze({
    EXACT: 'EXACT',
    WHITESPACE_INSENSITIVE: 'WHITESPACE_INSENSITIVE',
    NUMERIC_TOLERANCE: 'NUMERIC_TOLERANCE',
});

/**
 * Validation Service
 * ------------------
 * Compares execution results against expected outputs.
 *
 * Responsibilities:
 * - Compare stdout with expected output
 * - Apply comparison rules:
 *      exact match
 *      whitespace-insensitive
 *      numeric tolerance
 * - Produce structured verdicts:
 *      Accepted
 *      Wrong Answer
 *      Runtime Error
 *      Time Limit Exceeded
 *
 * Must NOT:
 * - Execute code
 * - Fetch problems
 *
 * Output format must include:
 * - verdict
 * - failed test index
 * - reason
 *
 * Design notes:
 * - Deterministic
 * - Pure logic (no side effects)
 * - Easily unit testable
 */
export class ValidationService {

    /**
     * Compare a single output string against an expected output string based on a strategy.
     */
    compareOutput(actual, expected, strategy) {
        switch (strategy) {
            case ComparisonStrategy.EXACT:
                return actual === expected;

            case ComparisonStrategy.WHITESPACE_INSENSITIVE:
                return actual.trim() === expected.trim();

            case ComparisonStrategy.NUMERIC_TOLERANCE:
                // Basic numeric tolerance: attempt to parse as float and compare with small epsilon
                const actualNum = parseFloat(actual.trim());
                const expectedNum = parseFloat(expected.trim());
                if (isNaN(actualNum) || isNaN(expectedNum)) {
                    // Fallback to exact if they aren't numbers
                    return actual.trim() === expected.trim();
                }
                const epsilon = 1e-6;
                return Math.abs(actualNum - expectedNum) < epsilon;

            default:
                throw new Error(`Unknown comparison strategy: ${strategy}`);
        }
    }

    /**
     * Validate a set of actual outputs against a set of test cases.
     * 
     * @param {string[]} actualOutputs The outputs produced by the executed code, in same order as testCases.
     * @param {Array} testCases The test cases to validate against.
     * @param {string} strategy The comparison strategy to apply.
     * @param {string} executionStatus The overall status of the execution (e.g. if it crashed or timed out).
     */
    validate(
        actualOutputs,
        testCases,
        strategy,
        executionStatus = ExecutionStatus.SUCCESS
    ) {

        // If the execution itself failed, bubble up that status.
        if (executionStatus !== ExecutionStatus.SUCCESS) {
            return {
                verdict: executionStatus,
                failedTestIndex: null,
                reason: `Execution failed with status: ${executionStatus}`
            };
        }

        if (actualOutputs.length !== testCases.length) {
            return {
                verdict: ExecutionStatus.INTERNAL_ERROR,
                failedTestIndex: null,
                reason: 'Mismatch between number of outputs and test cases'
            };
        }

        for (let i = 0; i < testCases.length; i++) {
            const actual = actualOutputs[i];
            const expected = testCases[i]?.expected_stdout;

            if (actual === undefined || expected === undefined) {
                return {
                    verdict: ExecutionStatus.INTERNAL_ERROR,
                    failedTestIndex: i,
                    reason: 'Missing output to compare'
                };
            }

            const isMatch = this.compareOutput(actual, expected, strategy);

            if (!isMatch) {
                // Return immediately on first failure
                // We use RUNTIME_ERROR as a stand-in for Wrong Answer since it's not in the enum explicitly,
                // or we could add it to the enum. The prompt says "Wrong Answer" should be a verdict.
                // Looking at ExecutionStatus, there is no WRONG_ANSWER. We will return SUCCESS but with a failed test index
                // Wait, if it fails a test, the verdict is usually a failure type. I will add WRONG_ANSWER to the verdict or use internal logic.
                // Let's assume the user meant to map this to an explicit 'WRONG_ANSWER' not in the generated ExecutionStatus, but we must use it.
                // For now, I'll return a special reason or just return SUCCESS but with a failed index (which implies wrong answer).
                // Actually, I'll use a custom property or reuse the types we have. Let's create an extended verdict here or use the requested strings.

                // Let's add WRONG_ANSWER to ExecutionStatus if possible, but I cannot modify execution.types easily if it's strictly defined.
                // Assuming we can return an object that conveys the failure.
                const displayExpected = typeof expected === 'string' ? expected : '';
                const displayActual = typeof actual === 'string' ? actual : '';
                return {
                    verdict: 'WRONG_ANSWER',
                    failedTestIndex: i,
                    reason: `Test case ${i} failed.\nExpected:\n${displayExpected}\nActual:\n${displayActual}`
                };
            }
        }

        return {
            verdict: ExecutionStatus.SUCCESS,
            failedTestIndex: null,
            reason: 'All test cases passed'
        };
    }
}
