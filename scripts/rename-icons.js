import { existsSync, readdirSync, renameSync, statSync } from 'fs';
import { join, parse } from 'path';

const iconsRootDir = './public/icons';

function toKebabCase(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function categoryName(value) {
  return toKebabCase(value.replace(/^\d+\.\s*/, ''));
}

function categoryNumber(value) {
  return Number(value.match(/^(\d+)\./)?.[1] ?? -1);
}

function renameEntries(dir, getNewName) {
  const entries = readdirSync(dir).filter(entry => getNewName(entry) !== entry);
  const targets = new Set();

  for (const entry of entries) {
    const target = getNewName(entry);
    const isCaseOnlyRename = entry.toLowerCase() === target.toLowerCase();
    if (!target || targets.has(target) || (existsSync(join(dir, target)) && !isCaseOnlyRename)) {
      throw new Error(`Cannot safely rename "${join(dir, entry)}" to "${target}".`);
    }
    targets.add(target);
  }

  for (const entry of entries) {
    renameSync(join(dir, entry), join(dir, getNewName(entry)));
  }

  return entries.length;
}

function renameCategories(dir) {
  const entries = readdirSync(dir).filter(entry => statSync(join(dir, entry)).isDirectory());
  const groups = Map.groupBy(entries, categoryName);
  const newNames = new Map();

  for (const [baseName, categories] of groups) {
    const [primary, ...duplicates] = [...categories].sort((first, second) => categoryNumber(second) - categoryNumber(first));
    newNames.set(primary, baseName);
    for (const category of duplicates) {
      newNames.set(category, `${baseName}-${categoryNumber(category)}`);
    }
  }

  return renameEntries(dir, entry => newNames.get(entry) ?? entry);
}

let renamedCategories = 0;
let renamedIcons = 0;

for (const size of readdirSync(iconsRootDir)) {
  const sizeDir = join(iconsRootDir, size);
  if (!statSync(sizeDir).isDirectory()) continue;

  for (const style of readdirSync(sizeDir)) {
    const styleDir = join(sizeDir, style);
    if (!statSync(styleDir).isDirectory()) continue;

    renamedCategories += renameCategories(styleDir);

    for (const category of readdirSync(styleDir)) {
      const categoryDir = join(styleDir, category);
      if (!statSync(categoryDir).isDirectory()) continue;
      renamedIcons += renameEntries(categoryDir, fileName => {
        const { name, ext } = parse(fileName);
        return `${toKebabCase(name)}${ext.toLowerCase()}`;
      });
    }
  }
}

console.log(`Renamed ${renamedCategories} category folders and ${renamedIcons} icon files.`);