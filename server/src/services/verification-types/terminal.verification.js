/**
 * Terminal / shell validators (stdout_exact, terminal_command, terminal_observation).
 * Runs user code in the container with test input and compares stdout (exact or regex).
 */

/**
 * @param {string} s
 * @param {{ normalize_newlines?: boolean, allow_trailing_whitespace?: boolean }} opts
 * @returns {string}
 */
function normalizeStdout(s, opts = {}) {
  let out = String(s ?? '');
  if (opts.normalize_newlines) {
    out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  if (opts.allow_trailing_whitespace) {
    out = out.replace(/\s+$/, '');
  }
  return out;
}

/**
 * @param {{ tests?: import('../../types/validation.types.js').ValidationTestResult[] } | import('../../types/validation.types.js').ValidationTestResult} result
 * @returns {import('../../types/validation.types.js').ValidationResult}
 */
function toResult(result) {
  const tests = Array.isArray(result.tests) ? result.tests : [result];
  const passed = tests.every((t) => t.passed);
  return {
    passed,
    tests,
    summary: passed ? 'All tests passed.' : `${tests.filter((t) => !t.passed).length} of ${tests.length} tests failed.`,
  };
}

/**
 * @param {object} ctx
 * @param {{ problem: { tests: Array<{ id?: string, input?: string, expected_stdout?: string, expected_stdout_regex?: string, normalize_newlines?: boolean, allow_trailing_whitespace?: boolean }>, language?: string }, solutionCode: string, containerId: string | null, language: string, containerService: import('../container.service.js').ContainerService }} ctx
 * @returns {Promise<import('../../types/validation.types.js').ValidationResult>}
 */
async function validateStdoutExact(ctx) {
  const { problem, solutionCode, containerId, language, containerService } = ctx;
  const tests = problem.tests ?? [];
  const lang = language ?? problem.language ?? 'bash';

  if (!containerId) {
    return toResult({
      passed: false,
      tests: [{ id: 'run', passed: false, message: 'No container available for validation. Run your code in the terminal first.' }],
    });
  }

  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testId = test.id ?? `test-${i + 1}`;
    const input = typeof test.input === 'string' ? test.input : '';
    const expectedStdout = typeof test.expected_stdout === 'string' ? test.expected_stdout : '';
    const expectedRegex = typeof test.expected_stdout_regex === 'string' ? test.expected_stdout_regex : null;

    try {
      const runResult = await containerService.run(containerId, '', input, solutionCode, lang);
      const actual = runResult.stdout ?? '';
      const opts = {
        normalize_newlines: Boolean(test.normalize_newlines),
        allow_trailing_whitespace: Boolean(test.allow_trailing_whitespace),
      };
      const actualNorm = normalizeStdout(actual, opts);

      let passed;
      let message;

      if (expectedRegex) {
        try {
          const re = new RegExp(expectedRegex);
          passed = re.test(actualNorm);
          message = passed ? undefined : `Output did not match regex /${expectedRegex}/.\nGot:\n${actual}`;
        } catch (reErr) {
          passed = false;
          message = `Invalid expected_stdout_regex: ${reErr?.message ?? 'bad pattern'}`;
        }
      } else {
        const expectedNorm = normalizeStdout(expectedStdout, opts);
        passed = actualNorm === expectedNorm;
        message = passed ? undefined : `Expected:\n${expectedStdout}\nGot:\n${actual}`;
      }

      results.push({
        id: testId,
        passed,
        stdout: actual,
        stderr: runResult.stderr,
        message,
      });
    } catch (err) {
      results.push({
        id: testId,
        passed: false,
        message: err?.message ?? 'Execution failed',
      });
    }
  }

  return toResult({ tests: results });
}

/**
 * Terminal command validator: same as stdout_exact (run code with test input, compare stdout).
 *
 * @param {object} ctx
 * @returns {Promise<import('../../types/validation.types.js').ValidationResult>}
 */
async function validateTerminalCommand(ctx) {
  return validateStdoutExact(ctx);
}

/**
 * Terminal observation: validates by running either a canonical command or the user's solution.
 * - If a test has `canonical_command`, that command is run in the container and stdout is checked
 *   against expected_stdout / expected_stdout_regex (no solution code used).
 * - Otherwise, behaves like stdout_exact: run solution with test input and compare stdout.
 *
 * @param {object} ctx
 * @param {{ problem: { tests: Array<{ id?: string, input?: string, expected_stdout?: string, expected_stdout_regex?: string, canonical_command?: string, normalize_newlines?: boolean, allow_trailing_whitespace?: boolean }>, language?: string }, solutionCode: string, containerId: string | null, language: string, containerService: import('../container.service.js').ContainerService }} ctx
 * @returns {Promise<import('../../types/validation.types.js').ValidationResult>}
 */
async function validateTerminalObservation(ctx) {
  const { problem, solutionCode, containerId, language, containerService } = ctx;
  const tests = problem.tests ?? [];
  const lang = language ?? problem.language ?? 'bash';

  if (!containerId) {
    return toResult({
      passed: false,
      tests: [{ id: 'run', passed: false, message: 'No container available for validation. Run your code in the terminal first.' }],
    });
  }

  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testId = test.id ?? `test-${i + 1}`;
    const canonicalCommand = typeof test.canonical_command === 'string' ? test.canonical_command.trim() : null;
    const expectedStdout = typeof test.expected_stdout === 'string' ? test.expected_stdout : '';
    const expectedRegex = typeof test.expected_stdout_regex === 'string' ? test.expected_stdout_regex : null;
    const opts = {
      normalize_newlines: Boolean(test.normalize_newlines),
      allow_trailing_whitespace: Boolean(test.allow_trailing_whitespace),
    };

    try {
      let actual;
      let stderr = '';

      if (canonicalCommand) {
        const runResult = await containerService.runCommand(containerId, canonicalCommand);
        actual = runResult.stdout ?? '';
        stderr = runResult.stderr ?? '';
      } else {
        const input = typeof test.input === 'string' ? test.input : '';
        const runResult = await containerService.run(containerId, '', input, solutionCode, lang);
        actual = runResult.stdout ?? '';
        stderr = runResult.stderr ?? '';
      }

      const actualNorm = normalizeStdout(actual, opts);

      let passed;
      let message;

      if (expectedRegex) {
        try {
          const re = new RegExp(expectedRegex);
          passed = re.test(actualNorm);
          message = passed ? undefined : `Output did not match regex /${expectedRegex}/.\nGot:\n${actual}`;
        } catch (reErr) {
          passed = false;
          message = `Invalid expected_stdout_regex: ${reErr?.message ?? 'bad pattern'}`;
        }
      } else {
        const expectedNorm = normalizeStdout(expectedStdout, opts);
        passed = actualNorm === expectedNorm;
        message = passed ? undefined : `Expected:\n${expectedStdout}\nGot:\n${actual}`;
      }

      results.push({
        id: testId,
        passed,
        stdout: actual,
        stderr,
        message,
      });
    } catch (err) {
      results.push({
        id: testId,
        passed: false,
        message: err?.message ?? 'Execution failed',
      });
    }
  }

  return toResult({ tests: results });
}

export const TERMINAL_VALIDATORS = {
  stdout_exact: validateStdoutExact,
  terminal_command: validateTerminalCommand,
  terminal_observation: validateTerminalObservation,
};
