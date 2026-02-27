/**
 * Problem Types
 * -------------
 * Defines schemas describing coding problems and test cases.
 *
 * Must include:
 * - Problem
 * - TestCase
 * - Constraint
 * - Visibility enum (public | hidden)
 *
 * Requirements:
 * - Immutable structures
 * - Strong typing for IDs
 * - Explicit input/output formats
 *
 * Agent instructions:
 * - Avoid optional fields unless absolutely necessary
 * - Every property must have documentation
 */

/**
 * Represents the visibility state of a problem.
 */
export const Visibility = Object.freeze({
    PUBLIC: 'public',
    HIDDEN: 'hidden',
});
