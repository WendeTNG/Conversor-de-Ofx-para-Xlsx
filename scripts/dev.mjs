import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const venvPython = resolve(root, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
const pythonCandidates = isWindows ? ['py', 'python'] : ['python3', 'python'];

if (!existsSync(resolve(root, 'node_modules', 'vite'))) {
  console.log('Preparando interface web...');
  const install = spawnSync(npmCommand, ['install'], { cwd: root, stdio: 'inherit' });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

function findPython() {
  for (const command of pythonCandidates) {
    const result = spawnSync(command, command === 'py' ? ['-3', '--version'] : ['--version'], {
      stdio: 'ignore',
      shell: false
    });
    if (result.status === 0) return command;
  }
  throw new Error('Python 3 não foi encontrado. Instale Python 3.11 ou superior e tente novamente.');
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const systemPython = findPython();
const pythonArgs = systemPython === 'py' ? ['-3'] : [];
if (!existsSync(venvPython)) {
  if (existsSync(resolve(root, '.venv'))) rmSync(resolve(root, '.venv'), { recursive: true, force: true });
  console.log('Preparando ambiente do backend...');
  run(systemPython, [...pythonArgs, '-m', 'venv', '.venv']);
}

const backendReady = spawnSync(venvPython, ['-m', 'pip', 'show', 'uvicorn'], { cwd: root, stdio: 'ignore' }).status === 0;
if (!backendReady) {
  console.log('Instalando bibliotecas do backend...');
  run(venvPython, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt']);
}

const api = spawn(venvPython, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'], {
  cwd: resolve(root, 'backend'),
  stdio: 'inherit',
  shell: false
});
const frontend = spawn(process.execPath, [resolve(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5173'], {
  cwd: root,
  stdio: 'inherit',
  shell: false
});

function stop() {
  api.kill();
  frontend.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', (code) => { if (code && code !== 0) { frontend.kill(); process.exit(code); } });
frontend.on('exit', (code) => { if (code && code !== 0) { api.kill(); process.exit(code); } });
