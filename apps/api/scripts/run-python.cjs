const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptArgs = process.argv.slice(2);

const candidates = process.platform === 'win32'
  ? [
      { command: path.join(repoRoot, '.venv', 'Scripts', 'python.exe'), args: [] },
      { command: 'python', args: [] },
      { command: 'py', args: ['-3'] },
    ]
  : [
      { command: path.join(repoRoot, '.venv', 'bin', 'python'), args: [] },
      { command: 'python3', args: [] },
      { command: 'python', args: [] },
    ];

for (const candidate of candidates) {
  const isPath = candidate.command.includes(path.sep);
  if (isPath && !existsSync(candidate.command)) {
    continue;
  }

  const result = spawnSync(candidate.command, [...candidate.args, ...scriptArgs], {
    stdio: 'inherit',
  });

  if (!result.error) {
    process.exit(result.status ?? 0);
  }

  if (result.error.code !== 'ENOENT') {
    console.error(result.error.message);
    process.exit(1);
  }
}

console.error('No Python interpreter was found. Create the repo .venv or install Python 3.11+.');
process.exit(1);
