import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const server = spawn(process.execPath, ['server/accountServer.js'], { stdio: 'inherit' });
const vite = spawn(npmCommand, ['run', 'dev'], { stdio: 'inherit' });

function stop(code = 0) {
  server.kill('SIGTERM');
  vite.kill('SIGTERM');
  process.exit(code);
}

server.on('exit', (code) => {
  if (code && code !== 0) stop(code);
});
vite.on('exit', (code) => {
  if (code && code !== 0) stop(code);
});
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
