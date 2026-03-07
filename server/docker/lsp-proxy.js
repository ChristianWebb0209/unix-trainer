#!/usr/bin/env node
/**
 * LSP proxy: forwards stdio to a language server process.
 * Run inside container: node lsp-proxy.js <language>
 * Host runs this via docker exec -i and bridges WebSocket <-> this process's stdio.
 * Uses absolute paths where possible so LSPs are found when exec has a minimal PATH.
 */
const { spawn } = require('child_process');
const { existsSync, readdirSync } = require('fs');
const { join } = require('path');

const language = (process.argv[2] || 'bash').toLowerCase();

function resolveCmd(cmd, absolutePaths) {
  for (const p of absolutePaths) {
    if (existsSync(p)) return p;
  }
  return cmd;
}

function buildClangdPath() {
  const parts = ['/usr/local/bin', '/usr/bin'];
  try {
    const opt = '/opt/clangd';
    if (existsSync(opt)) {
      const entries = readdirSync(opt);
      for (const e of entries) {
        const binDir = join(opt, e, 'bin');
        if (existsSync(binDir)) parts.push(binDir);
      }
    }
  } catch (_) {}
  return parts.join(':') + (process.env.PATH ? ':' + process.env.PATH : '');
}

function buildBashLsPath() {
  const parts = ['/usr/local/bin', '/usr/bin'];
  try {
    const npmPrefix = process.env.npm_config_prefix || '/usr/local';
    const bin = join(npmPrefix, 'bin');
    if (existsSync(bin)) parts.unshift(bin);
  } catch (_) {}
  return parts.join(':') + (process.env.PATH ? ':' + process.env.PATH : '');
}

/** PATH that includes npm global bin so pyright-langserver is findable when exec has minimal env. */
function buildNodeBinPath() {
  return buildBashLsPath();
}

function getLSP(lang) {
  switch (lang) {
    case 'bash':
    case 'unix':
      return {
        cmd: resolveCmd('bash-language-server', ['/usr/local/bin/bash-language-server', '/usr/bin/bash-language-server']),
        args: ['start'],
        env: { ...process.env, PATH: buildBashLsPath() },
        cwd: undefined,
      };
    case 'awk':
      return {
        cmd: resolveCmd('bash-language-server', ['/usr/local/bin/bash-language-server', '/usr/bin/bash-language-server']),
        args: ['start'],
        env: { ...process.env, PATH: buildBashLsPath() },
        cwd: undefined,
      };
    case 'c':
    case 'cpp':
      return { cmd: 'clangd', args: ['--background-index'], env: { ...process.env, PATH: buildClangdPath() }, cwd: undefined };
    case 'rust':
      return {
        cmd: resolveCmd('rust-analyzer', ['/usr/local/bin/rust-analyzer', '/usr/bin/rust-analyzer']),
        args: [],
        env: undefined,
        cwd: undefined,
      };
    case 'cuda':
    case 'vulkan':
    case 'sycl':
      return { cmd: 'clangd', args: ['--background-index'], env: { ...process.env, PATH: buildClangdPath() }, cwd: undefined };
    case 'python':
    case 'triton':
    case 'pytorch': {
      // Pyright needs a workspace root (cwd) or it can hang during initialization.
      const pyrightPaths = [
        '/usr/local/bin/pyright-langserver',
        '/usr/bin/pyright-langserver',
        join(process.env.npm_config_prefix || '/usr/local', 'bin', 'pyright-langserver'),
      ];
      const pyrightCmd = resolveCmd('pyright-langserver', pyrightPaths);
      const useNpx = pyrightCmd === 'pyright-langserver';
      return {
        cmd: useNpx ? 'npx' : pyrightCmd,
        args: useNpx ? ['--yes', 'pyright-langserver', '--stdio'] : ['--stdio'],
        env: { ...process.env, PATH: buildNodeBinPath() },
        cwd: '/workspace',
      };
    }
    default:
      return {
        cmd: resolveCmd('bash-language-server', ['/usr/local/bin/bash-language-server', '/usr/bin/bash-language-server']),
        args: ['start'],
        env: { ...process.env, PATH: buildBashLsPath() },
        cwd: undefined,
      };
  }
}

const { cmd, args, env, cwd } = getLSP(language);
const spawnOpts = {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: env || process.env,
};
if (cwd) spawnOpts.cwd = cwd;
const child = spawn(cmd, args, spawnOpts);

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.on('data', (d) => process.stderr.write(d));

child.on('error', (err) => {
  process.stderr.write(`LSP proxy error: ${err.message}\n`);
  process.exit(1);
});
child.on('exit', (code) => {
  process.exit(code != null ? code : 0);
});
