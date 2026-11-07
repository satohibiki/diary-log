// API サーバーと Vite を同時に起動する。どちらかが終了したら、もう一方も終了させる。
import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev', '-w', '@diary/server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', '@diary/web'], { stdio: 'inherit' }),
];

for (const child of children) {
  child.on('exit', (code) => {
    for (const other of children) other.kill();
    process.exit(code ?? 1);
  });
}
