#!/usr/bin/env node
/**
 * LSP proxy: forwards stdio to a language server process.
 * Run inside container: node lsp-proxy.js <language>
 * Host runs this via docker exec -i and bridges WebSocket <-> this process's stdio.
 */
const { spawn } = require('child_process');

const language = (process.argv[2] || 'bash').toLowerCase();

function getLSP(lang) {
  switch (lang) {
    case 'bash':
    case 'unix':
      return { cmd: 'bash-language-server', args: ['start'] };
    case 'awk':
      return { cmd: 'bash-language-server', args: ['start'] };
    case 'c':
    case 'cpp':
      return { cmd: 'clangd', args: ['--background-index'] };
    case 'rust':
      return { cmd: 'rust-analyzer', args: [] };
    case 'cuda':
    case 'vulkan':
    case 'sycl':
      return { cmd: 'clangd', args: ['--background-index'] };
    default:
      return { cmd: 'bash-language-server', args: ['start'] };
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
