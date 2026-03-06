/**
 * Registry of validation kinds. Only terminal (stdout) verification is supported.
 */
import { TERMINAL_VALIDATORS } from './terminal.verification.js';

export const validators = {
  ...TERMINAL_VALIDATORS,
};
