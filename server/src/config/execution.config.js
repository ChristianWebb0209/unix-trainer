export const EXECUTION_DEFAULTS = Object.freeze({
    language: 'alpine',
    timeLimitMs: 10000,
    memoryLimitBytes: 1024 * 1024 * 512, // 512MB
});

export const ALLOWED_LANGUAGES = Object.freeze(['alpine', 'bash', 'python', 'javascript']);
