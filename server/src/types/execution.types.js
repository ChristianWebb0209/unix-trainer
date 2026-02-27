/**
 * Execution Types
 * ---------------
 * Defines all shared type contracts related to code execution.
 *
 * Must include:
 * - ExecutionRequest
 * - ExecutionResult
 * - ResourceUsage
 * - ExecutionStatus enum
 *
 * Rules:
 * - Types must be serializable
 * - No business logic
 * - Used across services — must remain stable
 *
 * Agent instructions:
 * - Prefer strict unions over string literals
 * - Include full JSDoc comments for each field
 */

/**
 * Represents the status of an execution process.
 */
export const ExecutionStatus = Object.freeze({
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    SUCCESS: 'SUCCESS',
    COMPILATION_ERROR: 'COMPILATION_ERROR',
    RUNTIME_ERROR: 'RUNTIME_ERROR',
    TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
    MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
});
