import { constants } from 'node:fs';
import { copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(projectRoot, 'backend/.env.example');
const target = resolve(projectRoot, 'backend/.env');

try {
  await access(target, constants.F_OK);
  console.log('O arquivo backend/.env já existe e foi preservado.');
} catch {
  await copyFile(source, target, constants.COPYFILE_EXCL);
  console.log('Arquivo backend/.env criado. Abra-o e informe a senha do MySQL.');
}
