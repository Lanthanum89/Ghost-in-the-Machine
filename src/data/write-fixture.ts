import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateNight } from './generate';

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/night-01.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(generateNight(), null, 2) + '\n');
console.log(`Wrote ${target}`);
