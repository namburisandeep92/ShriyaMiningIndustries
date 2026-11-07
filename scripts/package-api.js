import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, '.swa-api');
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination);
cpSync(path.join(root, 'api'), path.join(destination, 'api'), { recursive: true });
cpSync(path.join(root, 'api', 'host.json'), path.join(destination, 'host.json'));
cpSync(path.join(root, 'api', 'http'), path.join(destination, 'http'), { recursive: true });

const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
delete manifest.scripts;
delete manifest.devDependencies;
writeFileSync(path.join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
cpSync(path.join(root, 'package-lock.json'), path.join(destination, 'package-lock.json'));
console.log('Azure Functions package staged in .swa-api; install its production dependencies before deployment.');
