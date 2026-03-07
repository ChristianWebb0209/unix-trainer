import * as sharedConfig from '../../../problem-config.mjs';

export const EXECUTION_DEFAULTS = Object.freeze({
    language: sharedConfig.PROBLEM_LANGUAGES.cuda.id,
    timeLimitMs: 10000,
    memoryLimitBytes: 1024 * 1024 * 512, // 512MB
});

export const ALLOWED_LANGUAGES = Object.freeze(
    sharedConfig.PROBLEM_LANGUAGE_IDS.filter((id) => id !== 'any'),
);

export const LANGUAGE_CONFIG = Object.freeze({
  c: { shell: '/bin/sh', displayName: 'C' },
  cpp: { shell: '/bin/sh', displayName: 'C++' },
  rust: { shell: '/bin/sh', displayName: 'Rust' },
  cuda: { shell: '/bin/sh', displayName: 'CUDA' },
  python: { shell: '/bin/sh', displayName: 'Python' },
  triton: { shell: '/bin/sh', displayName: 'Triton' },
  pytorch: { shell: '/bin/sh', displayName: 'PyTorch' },
});

// Map problem ID prefixes to languages
export const LANGUAGE_BY_PREFIX = Object.freeze({
  'c': 'c',
  'cpp': 'cpp',
  'rust': 'rust',
  'cuda': 'cuda',
  'py': 'python',
  'triton': 'triton',
  'torch': 'pytorch',
});
