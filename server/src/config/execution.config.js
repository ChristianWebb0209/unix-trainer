export const EXECUTION_DEFAULTS = Object.freeze({
    language: 'alpine',
    timeLimitMs: 10000,
    memoryLimitBytes: 1024 * 1024 * 512, // 512MB
});

export const ALLOWED_LANGUAGES = Object.freeze(['alpine', 'bash', 'awk', 'unix', 'python', 'javascript']);

export const LANGUAGE_CONFIG = Object.freeze({
    bash: { shell: '/bin/bash', displayName: 'Bash' },
    awk: { shell: '/bin/awk', displayName: 'AWK' },
    unix: { shell: '/bin/sh', displayName: 'Unix Shell' },
    alpine: { shell: '/bin/sh', displayName: 'Alpine' },
    python: { shell: '/bin/sh', displayName: 'Python' },
    javascript: { shell: '/bin/sh', displayName: 'JavaScript' }
});

// Map problem ID prefixes to languages
export const LANGUAGE_BY_PREFIX = Object.freeze({
    'awk': 'awk',
    'bash': 'bash',
    'unix': 'unix',
    'py': 'python',
    'js': 'javascript',
    'alpine': 'alpine'
});
