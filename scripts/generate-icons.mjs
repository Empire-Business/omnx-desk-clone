import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icons/icon.svg');
const svg = readFileSync(svgPath);

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
];

for (const { name, size } of sizes) {
  const output = resolve(__dirname, '../public/icons', name);
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(output);
  console.log(`✓ Generated ${name} (${size}x${size})`);
}

// Also generate favicon.ico (use 32px as base)
const favicon32 = resolve(__dirname, '../public/icons/favicon-32.png');
const faviconDest = resolve(__dirname, '../public/favicon.png');
await sharp(svg)
  .resize(32, 32)
  .png()
  .toFile(faviconDest);
console.log('✓ Generated favicon.png');

console.log('\nDone! Icons generated in public/icons/');
