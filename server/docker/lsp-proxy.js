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

function resolveClangd() {
  const tried = ['/usr/local/bin/clangd', '/usr/bin/clangd', '/opt/clangd/bin/clangd'];
  for (const p of tried) {
    if (existsSync(p)) return p;
  }
  try {
    const opt = '/opt/clangd';
    if (existsSync(opt)) {
      const entries = readdirSync(opt);
      for (const e of entries) {
        const binPath = join(opt, e, 'bin', 'clangd');
        if (existsSync(binPath)) return binPath;
      }
    }
  } catch (_) {}
  return 'clangd';
}

function getLSP(lang) {
  switch (lang) {
    case 'bash':
    case 'unix':
      return {
        cmd: resolveCmd('bash-language-server', ['/usr/local/bin/bash-language-server', '/usr/bin/bash-language-server']),
        args: ['start'],
      };
    case 'awk':
      return {
        cmd: resolveCmd('bash-language-server', ['/usr/local/bin/bash-language-server', '/usr/bin/bash-language-server']),
        args: ['start'],
      };
    case 'c':
    case 'cpp':
      return { cmd: resolveClangd(), args: ['--background-index'] };
    case 'rust':
      return {
        cmd: resolveCmd('rust-analyzer', ['/usr/local/bin/rust-analyzer', '/usr/bin/rust-analyzer']),
        args: [],
      };
    case 'cuda':
    case 'vulkan':
    case 'sycl':
      return { cmd: resolveClangd(), args: ['--background-index'] };
    default:
      return {
        cmd: resolveCmd('bash-language-server', ['/usr/local/bin/bash-language-server', '/usr/bin/bash-language-server']),
        args: ['start'],
      };
  }
}

const { cmd, args } = getLSP(language);
const child = spawn(cmd, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.on('data', (d) => process.stderr.write(d));

child.on('error', (err) => {
  process.stderr.write(`LSP proxy error: ${err.message}\n`);
  process.exit(1);
});
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
