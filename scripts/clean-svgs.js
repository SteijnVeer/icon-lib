import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const iconsRootDir = './public/icons';

// Attributes that are always safe to drop from the root <svg> tag for this icon set
// (verified: no <use>/<clipPath>/<defs>/<text> elements reference them anywhere in public/icons).
const svgAttrDenyList = new Set(['version', 'id', 'xmlns:xlink', 'x', 'y', 'xml:space']);

function findSvgFiles(dir) {
  return readdirSync(dir).flatMap(entry => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return findSvgFiles(fullPath);
    return entry.endsWith('.svg') ? [fullPath] : [];
  });
}

function cleanSvgTag(svgTag) {
  const attrs = [...svgTag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)]
    .filter(([, name, value]) => {
      if (svgAttrDenyList.has(name)) return false;
      if (name === 'style' && /enable-background/i.test(value)) return false;
      return true;
    })
    .map(([, name, value]) => `${name}="${value}"`);

  return `<svg ${attrs.join(' ')}>`;
}

function cleanSvg(content) {
  let cleaned = content
    .replace(/<\?xml[\s\S]*?\?>\s*/, '')
    .replace(/<!DOCTYPE[\s\S]*?>\s*/, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<svg\b[^>]*>/, cleanSvgTag);

  // Remove empty <g> groups, repeating until no more collapse (handles nested empties).
  let previous;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(/<g(?:\s[^>]*)?>\s*<\/g>/g, '');
  } while (cleaned !== previous);

  return cleaned
    .replace(/\n\s*\n+/g, '\n')
    .trim() + '\n';
}

const svgFiles = findSvgFiles(iconsRootDir);
let bytesBefore = 0;
let bytesAfter = 0;

for (const filePath of svgFiles) {
  const original = readFileSync(filePath, 'utf8');
  const cleaned = cleanSvg(original);
  bytesBefore += Buffer.byteLength(original);
  bytesAfter += Buffer.byteLength(cleaned);
  if (cleaned !== original) writeFileSync(filePath, cleaned);
}

console.log(`Cleaned ${svgFiles.length} SVG files.`);
console.log(`Size: ${bytesBefore.toLocaleString()} -> ${bytesAfter.toLocaleString()} bytes (${(100 - (bytesAfter / bytesBefore) * 100).toFixed(1)}% smaller).`);
