// Empacota o build de produção (dist/) já gerado por `vite build` dentro de
// um único .exe Windows, via o launcher Go em desktop/main.go (embute os
// arquivos estáticos e abre uma janela de aplicativo nativa via WebView2,
// sem console e sem depender do navegador do usuário).
// Requer o toolchain do Go instalado (https://go.dev) - não precisa de
// Rust/Electron/etc.
import { existsSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fs.cpSync trava o processo (sem stdout/stderr, saída 127) neste ambiente -
// cópia manual recursiva como alternativa mais simples e confiável.
function copyDirRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const desktopDir = path.join(root, 'desktop');
const desktopDistDir = path.join(desktopDir, 'dist');
const outExe = path.join(root, 'Magispelll.exe');

if (!existsSync(distDir)) {
  console.error('dist/ não encontrado - rode "npm run build" antes (ou use "npm run build:exe").');
  process.exit(1);
}

rmSync(desktopDistDir, { recursive: true, force: true });
copyDirRecursive(distDir, desktopDistDir);

console.log('Compilando o executável com Go...');
execFileSync('go', ['build', '-ldflags', '-s -w -H=windowsgui', '-o', outExe, '.'], {
  cwd: desktopDir,
  stdio: 'inherit',
});

console.log(`Pronto: ${outExe}`);
