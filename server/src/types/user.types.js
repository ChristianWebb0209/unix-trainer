/**
 * User Types
 * ----------
 * Shared type definitions related to users and submissions.
 *
 * Must include:
 * - User
 * - Submission
 * - SubmissionStatus
 *
 * Constraints:
 * - No authentication logic
 * - No database logic
 * - Pure type definitions only
 *
 * Agent notes:
 * - Submission must reference problemId and userId
 * - Status must support lifecycle states:
 *      pending ? running ? completed ? failed
 */

/**
 * Represents the distinct lifecycle states of a code submission.
 */
export const SubmissionStatus = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
});
