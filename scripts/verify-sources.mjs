import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'assets/figma/svg');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
const originals = manifest.filter((x) => x.file);
for (const entry of originals) {
  const source = fs.readFileSync(path.join(base, entry.file));
  const actual = createHash('sha256').update(source).digest('hex');
  if (actual !== entry.sha256) throw new Error(`Source changed: ${entry.file}`);
}
if (originals.length !== 40)
  throw new Error(`Expected 40 object SVGs, received ${originals.length}`);
console.log(
  `Verified ${originals.length} unchanged original SVG files. ${manifest.length - originals.length} exact duplicate submissions recorded.`,
);
