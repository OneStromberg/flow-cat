// Author-time icon generator (dev-only). Rasterizes app/icon.svg into the
// committed PNG set under public/. Run once with `node scripts/gen-icons.mjs`
// (needs the dev dependency `sharp`); the PNGs are committed as static assets so
// there is NO runtime rasterization.
//
// Outputs:
//   public/icon-192.png            192  purpose: any
//   public/icon-512.png            512  purpose: any
//   public/icon-192-maskable.png   192  purpose: maskable (full-bleed, safe zone)
//   public/icon-512-maskable.png   512  purpose: maskable
//   public/apple-touch-icon.png    180  iOS home screen
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const publicDir = join(webRoot, 'public');

/** Strip the outer <svg> wrapper, returning just the inner drawing content. */
function innerSvg(svg) {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

// Maskable variant: a FULL-BLEED #111827 square (no rounded corners — Android
// applies its own mask) with the cat art scaled to the ~80% center safe zone so
// the mask never clips it. 0.8 scale + 10% (51.2px) translate keeps it centered.
function maskableSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#111827"/>
  <g transform="translate(51.2,51.2) scale(0.8)">${inner}</g>
</svg>`;
}

async function raster(svg, size, outName) {
  const out = join(publicDir, outName);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log(`  ✓ ${outName} (${size}×${size})`);
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  const standard = await readFile(join(webRoot, 'app', 'icon.svg'), 'utf8');
  const maskable = maskableSvg(innerSvg(standard));

  console.log('Generating PWA icons → public/');
  await raster(standard, 192, 'icon-192.png');
  await raster(standard, 512, 'icon-512.png');
  await raster(maskable, 192, 'icon-192-maskable.png');
  await raster(maskable, 512, 'icon-512-maskable.png');
  await raster(standard, 180, 'apple-touch-icon.png');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
