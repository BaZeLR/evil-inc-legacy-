import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const distDir = path.join(process.cwd(), 'dist');
  await fs.rm(distDir, { recursive: true, force: true });
  console.log('clean: removed dist/');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

