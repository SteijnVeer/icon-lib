import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'fs';
import { join, parse } from 'path';

const iconsRootDir = './public/icons';
const sizes = ['24px', '30px'];
const styles = ['line', 'solid'];
const moves = [];

for (const size of sizes) {
  for (const style of styles) {
    const sourceStyleDir = join(iconsRootDir, size, style);
    if (!existsSync(sourceStyleDir)) continue;

    for (const category of readdirSync(sourceStyleDir)) {
      const sourceCategoryDir = join(sourceStyleDir, category);
      if (!statSync(sourceCategoryDir).isDirectory()) continue;

      for (const fileName of readdirSync(sourceCategoryDir)) {
        const sourcePath = join(sourceCategoryDir, fileName);
        if (!statSync(sourcePath).isFile() || parse(fileName).ext !== '.svg') continue;

        const destinationDir = join(iconsRootDir, style, category);
        const destinationPath = join(destinationDir, `${parse(fileName).name}-${size}.svg`);
        moves.push({ sourcePath, destinationDir, destinationPath });
      }
    }
  }
}

const destinations = new Set();
for (const { destinationPath } of moves) {
  if (existsSync(destinationPath) || destinations.has(destinationPath)) {
    throw new Error(`Destination already exists: ${destinationPath}`);
  }
  destinations.add(destinationPath);
}

for (const { sourcePath, destinationDir, destinationPath } of moves) {
  mkdirSync(destinationDir, { recursive: true });
  renameSync(sourcePath, destinationPath);
}

function removeIfEmpty(dir) {
  try {
    rmdirSync(dir);
  } catch (error) {
    if (error.code !== 'ENOTEMPTY') throw error;
  }
}

for (const size of sizes) {
  for (const style of styles) {
    const sourceStyleDir = join(iconsRootDir, size, style);
    if (!existsSync(sourceStyleDir)) continue;
    for (const category of readdirSync(sourceStyleDir)) {
      removeIfEmpty(join(sourceStyleDir, category));
    }
    removeIfEmpty(sourceStyleDir);
  }
  const sourceSizeDir = join(iconsRootDir, size);
  if (existsSync(sourceSizeDir)) removeIfEmpty(sourceSizeDir);
}

console.log(`Moved ${moves.length} SVG files to style/category/icon-size paths.`);