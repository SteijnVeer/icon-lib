import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const categoriesRootDir = './public/icons/line';
const indexFilePath = './public/index.json';
const styles = ['line', 'solid'];
const sizes = ['24px', '30px'];

function iconVariants(category, icon) {
  return styles.flatMap(style => sizes
    .filter(size => existsSync(join('./public/icons', style, category, `${icon}-${size}.svg`)))
    .map(size => `${style}-${size}`));
}

const categories = Object.fromEntries(readdirSync(categoriesRootDir).map(category => {
  const icons = readdirSync(join(categoriesRootDir, category))
    .filter(file => file.endsWith('-24px.svg'))
    .map(file => file.replace('-24px.svg', ''));

  return [category, icons.map(name => ({ name, variants: iconVariants(category, name) }))];
}));

writeFileSync(indexFilePath, JSON.stringify({
  styles,
  sizes,
  categories,
}, null, 2));
