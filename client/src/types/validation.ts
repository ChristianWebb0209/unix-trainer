/**
 * Validation result from POST /api/problems/:problemId/validate.
 * Keep in sync with server validation.types.js.
 */
export interface ValidationTestResult {
  id: string;
  passed: boolean;
  stdout?: string;
  stderr?: string;
  message?: string;
}

export interface ValidationResult {
  passed: boolean;
  tests: ValidationTestResult[];
  summary: string;
}
