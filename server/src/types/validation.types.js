/**
 * Validation Types
 * ---------------
 * Only terminal (stdout) verification is supported.
 *
 * @typedef {Object} StdoutTest
 * @property {string} id
 * @property {string} [input]
 * @property {string} [expected_stdout]
 * @property {string} [expected_stdout_regex]
 * @property {string} [canonical_command] - For terminal_observation: run this command and check stdout (no solution code).
 * @property {boolean} [allow_trailing_whitespace]
 * @property {boolean} [normalize_newlines]
 *
 * @typedef {Object} ValidationStrategyStdoutExact
 * @property {'stdout_exact'} kind
 * @property {StdoutTest[]} [tests]
 *
 * @typedef {Object} ValidationStrategyTerminalCommand
 * @property {'terminal_command'} kind
 * @property {StdoutTest[]} [tests]
 * @property {string} [canonicalCommand]
 *
 * @typedef {Object} ValidationStrategyTerminalObservation
 * @property {'terminal_observation'} kind
 * @property {StdoutTest[]} [tests]
 *
 * @typedef {ValidationStrategyStdoutExact|ValidationStrategyTerminalCommand|ValidationStrategyTerminalObservation} ValidationStrategy
 */

/**
 * @typedef {Object} ValidationTestResult
 * @property {string} id
 * @property {boolean} passed
 * @property {string} [stdout]
 * @property {string} [stderr]
 * @property {string} [message]
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} passed
 * @property {ValidationTestResult[]} tests
 * @property {string} summary
 */

/** Supported validation kinds (terminal / stdout only). */
export const VALIDATION_KINDS = Object.freeze([
  'stdout_exact',
  'terminal_command',
  'terminal_observation',
]);
