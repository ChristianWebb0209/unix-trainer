import * as sharedConfig from '../../../problem-config.mjs';

export const EXECUTION_DEFAULTS = Object.freeze({
    language: sharedConfig.PROBLEM_LANGUAGES.bash.id,
    timeLimitMs: 10000,
    memoryLimitBytes: 1024 * 1024 * 512, // 512MB
});

export const ALLOWED_LANGUAGES = Object.freeze([
    ...sharedConfig.PROBLEM_LANGUAGE_IDS.filter((id) => id !== 'any'),
    'alpine',
    'python',
    'javascript',
]);

export const LANGUAGE_CONFIG = Object.freeze({
    bash: { shell: 'bash', displayName: 'Bash' },
    awk: { shell: 'awk', displayName: 'AWK' },
    unix: { shell: 'sh', displayName: 'Unix Shell' },
    alpine: { shell: '/bin/sh', displayName: 'Alpine' },
    python: { shell: '/bin/sh', displayName: 'Python' },
  javascript: { shell: '/bin/sh', displayName: 'JavaScript' },
  c: { shell: '/bin/sh', displayName: 'C' },
  cpp: { shell: '/bin/sh', displayName: 'C++' },
  rust: { shell: '/bin/sh', displayName: 'Rust' },
  cuda: { shell: '/bin/sh', displayName: 'CUDA' },
  vulkan: { shell: '/bin/sh', displayName: 'Vulkan' },
  sycl: { shell: '/bin/sh', displayName: 'SYCL' },
});

// Map problem ID prefixes to languages
export const LANGUAGE_BY_PREFIX = Object.freeze({
    'awk': 'awk',
    'bash': 'bash',
    'unix': 'unix',
    'py': 'python',
    'js': 'javascript',
  'alpine': 'alpine',
  'c': 'c',
  'cpp': 'cpp',
  'rust': 'rust',
  'cuda': 'cuda',
  'vulkan': 'vulkan',
  'sycl': 'sycl',
});
