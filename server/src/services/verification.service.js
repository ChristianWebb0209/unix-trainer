/**
 * Verification Service
 * --------------------
 * Single entrypoint for "validate this problem/solution".
 * Validation method can be specified per test (prefix on id or validation/kind field) or via problem-level validation; default is stdout_exact.
 */
import { validators } from './verification-types/index.verification.js';
import { Visibility } from '../types/problem.types.js';

/** Default when no validation is specified for a test or the problem. */
const DEFAULT_VALIDATION_KIND = 'stdout_exact';

/**
 * Resolves which validation kind to use for a single test.
 * 1. test.validation or test.kind (explicit field)
 * 2. Prefix on test.id: "kind::id" (e.g. "cuda_numeric::run" or "stdout_exact::tc1")
 * 3. problem.validation.kind (problem-level default)
 * 4. DEFAULT_VALIDATION_KIND
 * @param {{ id?: string, validation?: string, kind?: string }} test
 * @param {string} [problemDefaultKind]
 * @returns {string}
 */
function resolveTestValidationKind(test, problemDefaultKind) {
  let kind = null;
  if (test && typeof test.validation === 'string' && test.validation.trim()) {
    kind = test.validation.trim();
  } else if (test && typeof test.kind === 'string' && test.kind.trim()) {
    kind = test.kind.trim();
  } else {
    const id = typeof test?.id === 'string' ? test.id : '';
    const prefixMatch = id.match(/^([a-z][a-z0-9_]*)::(.+)$/);
    if (prefixMatch && validators[prefixMatch[1]]) {
      return prefixMatch[1];
    }
  }
  if (kind && validators[kind]) return kind;
  if (problemDefaultKind && validators[problemDefaultKind]) {
    return problemDefaultKind;
  }
  return DEFAULT_VALIDATION_KIND;
}

/**
 * @param {import('../types/validation.types.js').ValidationResult} result
 * @returns {import('../types/validation.types.js').ValidationResult}
 */
function normalizeResult(result) {
  const tests = Array.isArray(result.tests) ? result.tests : [];
  const passed = Boolean(result.passed);
  const summary = typeof result.summary === 'string' ? result.summary : (passed ? 'All tests passed.' : 'Validation failed.');
  return {
    passed,
    tests: tests.map((t) => ({
      id: t.id ?? 'unknown',
      passed: Boolean(t.passed),
      stdout: t.stdout,
      stderr: t.stderr,
      message: t.message,
    })),
    summary,
  };
}

export class VerificationService {
  /**
   * @param {import('./container.service.js').ContainerService} containerService
   * @param {import('./problem.service.js').ProblemService} problemService
   */
  constructor(containerService, problemService) {
    this.containerService = containerService;
    this.problemService = problemService;
  }

  /**
   * Validates a user's solution for a given problem.
   * Groups tests by resolved validation kind (per-test or problem default), runs the appropriate validator per group, merges results in original test order.
   * @param {{ problemId: string, solutionCode: string, userId?: string, containerId?: string, language?: string, testOutputs?: Array<{ testId: string, values: number[] }> }} params
   * @returns {Promise<import('../types/validation.types.js').ValidationResult>}
   */
  async validate({ problemId, solutionCode, userId = null, containerId = null, language = null, testOutputs = null }) {
    const problem = await this.problemService.getProblem(problemId);
    if (!problem) {
      throw new Error(`Problem ${problemId} not found`);
    }

    const problemDefaultKind =
      (problem?.validation && typeof problem.validation === 'object' && problem.validation.kind) || DEFAULT_VALIDATION_KIND;
    const tests = await this.problemService.getTestCases(problemId, Visibility.HIDDEN);

    if (!tests.length) {
      return normalizeResult({
        passed: true,
        tests: [],
        summary: 'No tests to run.',
      });
    }

    const withKind = tests.map((test, index) => {
      const kind = resolveTestValidationKind(test, problemDefaultKind);
      return { test, index, kind };
    });

    const byKind = new Map();
    for (const { test, index, kind } of withKind) {
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push({ test, index });
    }

    const resultsByIndex = new Map();
    for (const [kind, group] of byKind) {
      const validator = validators[kind];
      if (!validator) {
        const msg = `Validation type "${kind}" is not supported. Only terminal (stdout) verification is available.`;
        group.forEach(({ test, index }) => {
          resultsByIndex.set(index, {
            id: test.id ?? `test-${index + 1}`,
            passed: false,
            message: msg,
          });
        });
        continue;
      }
      const subset = group.map(({ test }) => test);
      const ctx = {
        problem: { ...problem, tests: subset },
        solutionCode,
        strategy: { kind },
        containerService: this.containerService,
        containerId,
        userId,
        language: language ?? problem.language ?? 'bash',
        testOutputs: testOutputs ?? null,
      };
      const result = await validator(ctx);
      const resultTests = Array.isArray(result.tests) ? result.tests : [];
      group.forEach(({ index }, i) => {
        resultsByIndex.set(index, resultTests[i] ?? { id: `test-${index + 1}`, passed: false, message: 'No result from validator' });
      });
    }

    const ordered = tests.map((_, index) => resultsByIndex.get(index)).filter(Boolean);
    const passed = ordered.every((t) => t.passed);
    const failedCount = ordered.filter((t) => !t.passed).length;

    return normalizeResult({
      passed,
      tests: ordered,
      summary: passed ? 'All tests passed.' : `${failedCount} of ${ordered.length} tests failed.`,
    });
  }
}
