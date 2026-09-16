import JSZip from 'jszip';
import { useEffect, useRef, useState } from 'react';

type IconStyle = 'line' | 'solid';
type IconSize = '24px' | '30px';
type IconVariant = `${IconStyle}-${IconSize}`;

type IconInfo = {
  name: string;
  variants: IconVariant[];
};

type IconsIndex = Record<string, IconInfo[]>;

type SelectedIcon = {
  categoryName: string;
  name: string;
};

type HashTarget = {
  categoryName: string;
  iconName?: string;
};

type ExportState = 'idle' | 'exporting' | 'error';

type SearchResult = {
  categoryName: string;
  icon: IconInfo;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function categoryId(categoryName: string) {
  return slugify(categoryName);
}

function iconId(categoryName: string, iconName: string) {
  return `${slugify(categoryName)}--${slugify(iconName)}`;
}

function iconVariant(style: IconStyle, size: IconSize): IconVariant {
  return `${style}-${size}`;
}

function getIconPath(style: IconStyle, categoryName: string, iconName: string, size: IconSize) {
  return `/icons/${style}/${categoryName}/${iconName}-${size}.svg`;
}

function getMatchIndexes(value: string, query: string) {
  const indexes: number[] = [];
  let valueIndex = 0;

  for (const queryCharacter of query) {
    const matchIndex = value.toLowerCase().indexOf(queryCharacter, valueIndex);
    if (matchIndex < 0) return null;
    indexes.push(matchIndex);
    valueIndex = matchIndex + 1;
  }

  return indexes;
}

function spriteSymbol(id: string, source: string) {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = document.documentElement;
  const viewBox = svg.getAttribute('viewBox');
  if (svg.localName !== 'svg' || !viewBox) throw new Error(`Could not read SVG data for ${id}.`);
  return `<symbol id="${id}" viewBox="${viewBox}">${svg.innerHTML}</symbol>`;
}

function escapeTypeScriptString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function createIconComponent(selectedIcons: SelectedIcon[]) {
  const uniqueIconNamesInQuotes = [...new Set(selectedIcons.map(icon => `'${escapeTypeScriptString(icon.name)}'`))];

  return `import type { SVGProps } from 'react';

export const ICONS_BASE_URL = '/icons/';
export const iconNames = [${uniqueIconNamesInQuotes.join(', ')}] as const;
export type IconName = ${uniqueIconNamesInQuotes.join(' | ') || 'never'};
export type IconSize = 24 | 30 | '24' | '30';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'> & {
  name: IconName;
  solid?: boolean;
  size?: IconSize;
  color?: string;
};

export function Icon({ name, solid = false, size = 24, color = 'currentColor', ...props }: IconProps) {
  const normalizedSize = Number(size);
  const sizeSuffix = \`\${normalizedSize}px\`;

  return (
    <svg
      viewBox={\`0 0 \${normalizedSize} \${normalizedSize}\`}
      width={sizeSuffix}
      height={sizeSuffix}
      fill={color}
      {...props}
    >
      <use
        href={\`\${ICONS_BASE_URL}\${solid ? 'solid' : 'line'}-\${sizeSuffix}.svg#\${name}\`}
      />
    </svg>
  );
}
`;
}


function createExternalIconComponent(allIcons: Record<string, string[]>) {
  const uniqueIconNamesInQuotes = [...new Set(Object.values(allIcons).flat())].map(name => `'${escapeTypeScriptString(name)}'`);

  return `import type { SVGProps } from 'react';

export const ICONS_BASE_URL = '${window.location.origin}/icons/';
const categoryEntries = [
${Object.entries(allIcons).map(([category, icons]) => `  ['${category}', new Set([${icons.map(icon => `'${escapeTypeScriptString(icon)}'`).join(', ')}])],`).join('\n')}
] as const;
export const iconNames = [${uniqueIconNamesInQuotes.join(', ')}] as const;
export type IconName = ${uniqueIconNamesInQuotes.join(' | ') || 'never'};
export type IconSize = 24 | 30 | '24' | '30';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'> & {
  name: IconName;
  solid?: boolean;
  size?: IconSize;
  color?: string;
};

export function Icon({ name, solid = false, size = 24, color = 'currentColor', ...props }: IconProps) {
  const normalizedSize = Number(size);
  const sizeSuffix = \`\${normalizedSize}px\`;

  return (
    <svg
      viewBox={\`0 0 \${normalizedSize} \${normalizedSize}\`}
      width={sizeSuffix}
      height={sizeSuffix}
      fill={color}
      {...props}
    >
      <use
        href={\`\${ICONS_BASE_URL}\${solid ? 'solid' : 'line'}/\${categoryEntries.find(([category, icons]) => icons.has(name))?.[0]}/\${name}-\${sizeSuffix}.svg\`}
      />
    </svg>
  );
}
`;
}

export default function App() {
  const [loadingState, setLoadingState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [iconStyle, setIconStyle] = useState<IconStyle>('line');
  const [iconSize, setIconSize] = useState<IconSize>('24px');
  const [selectedIcon, setSelectedIcon] = useState<SelectedIcon | null>(null);
  const [selectedIcons, setSelectedIcons] = useState<SelectedIcon[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const iconsIndexRef = useRef<IconsIndex>({});
  const idLookupRef = useRef<Map<string, HashTarget>>(new Map());

  useEffect(() => {
    const applyHash = (hash: string) => {
      const id = decodeURIComponent(hash.replace(/^#/, ''));
      if (!id) return;
      const target = idLookupRef.current.get(id);
      if (!target) return;
      setExpandedCategories(prev => ({ ...prev, [target.categoryName]: true }));
      if (target.iconName) {
        setSelectedIcon({ categoryName: target.categoryName, name: target.iconName });
      }
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      });
    };

    try {
      fetch('/index.json')
        .then(response => response.json())
        .then(({ categories }: { categories: IconsIndex }) => {
          iconsIndexRef.current = categories;

          const lookup = new Map<string, HashTarget>();
          for (const [categoryName, icons] of Object.entries(categories)) {
            lookup.set(categoryId(categoryName), { categoryName });
            for (const icon of icons) {
              lookup.set(iconId(categoryName, icon.name), { categoryName, iconName: icon.name });
            }
          }
          idLookupRef.current = lookup;

          setLoadingState('loaded');
          applyHash(window.location.hash);
        });
    } catch (error) {
      console.error('Failed to fetch icons index:', error);
      setLoadingState('error');
    }

    const onHashChange = () => applyHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSelectIcon = (icon: SelectedIcon) => {
    setSelectedIcon(icon);
    window.location.hash = iconId(icon.categoryName, icon.name);
  };

  const handleToggleSelectedIcon = (icon: SelectedIcon) => {
    setSelectedIcons(selected => selected.some(selectedIcon => iconId(selectedIcon.categoryName, selectedIcon.name) === iconId(icon.categoryName, icon.name))
      ? selected.filter(selectedIcon => iconId(selectedIcon.categoryName, selectedIcon.name) !== iconId(icon.categoryName, icon.name))
      : [...selected, icon]);
  };

  const handleExport = async () => {
    setExportState('exporting');
    try {
      const iconInfo = new Map(Object.entries(iconsIndexRef.current)
        .flatMap(([categoryName, icons]) => icons.map(icon => [iconId(categoryName, icon.name), icon] as const)));
      const zip = new JSZip();

      for (const style of ['line', 'solid'] as const) {
        for (const size of ['24px', '30px'] as const) {
          const variant = iconVariant(style, size);
          const symbols = await Promise.all(selectedIcons
            .filter(selected => iconInfo.get(iconId(selected.categoryName, selected.name))?.variants.includes(variant))
            .map(async selected => {
              const response = await fetch(getIconPath(style, selected.categoryName, selected.name, size));
              if (!response.ok) throw new Error(`Could not load ${selected.name}.`);
              return spriteSymbol(selected.name, await response.text());
            }));
          zip.file(`${style}-${size}.svg`, `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>\n`);
        }
      }

      zip.file('icon.tsx', createIconComponent(selectedIcons));

      const archive = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archive);
      link.download = 'icons.zip';
      link.click();
      URL.revokeObjectURL(link.href);
      setExportState('idle');
      setExportModalOpen(false);
    } catch (error) {
      console.error('Failed to export icons:', error);
      setExportState('error');
    }
  };

  const handleDownloadExternalComponent = async () => {
    setExportState('exporting');
    try {
      const zip = new JSZip();
      zip.file('icon.tsx', createExternalIconComponent(Object.fromEntries(Object.entries(iconsIndexRef.current).map(([categoryName, icons]) => [categoryName, icons.map(icon => icon.name)]))));

      const archive = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archive);
      link.download = 'icons.zip';
      link.click();
      URL.revokeObjectURL(link.href);
      setExportState('idle');
      setExportModalOpen(false);
    } catch (error) {
      console.error('Failed to export external component:', error);
      setExportState('error');
    }
  };

  const handleCloseModal = () => {
    setSelectedIcon(null);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const handleToggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => ({ ...prev, [categoryName]: !prev[categoryName] }));
  };

  const normalizedSearchQuery = debouncedSearchQuery.trim().toLowerCase();
  const searchResults: SearchResult[] = normalizedSearchQuery
    ? Object.entries(iconsIndexRef.current).flatMap(([categoryName, icons]) => icons
      .filter(icon => getMatchIndexes(icon.name, normalizedSearchQuery) !== null)
      .map(icon => ({ categoryName, icon })))
    : [];
  const selectedIconIds = new Set(selectedIcons.map(icon => iconId(icon.categoryName, icon.name)));

  if (loadingState === 'loading')
    return (
      <body>
        Loading...
      </body>
    );

  if (loadingState === 'error')
    return (
      <body>
        Failed to load icons.
      </body>
    );

  return (
    <body id="top">
      <header>
        <a className="title-button" href="#top">Icon Library</a>
        <div className="controls">
          <label className="search-input">
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search icons"
            />
          </label>
          <fieldset>
            <legend>Style</legend>
            {(['line', 'solid'] as const).map(style => (
              <label key={style}>
                <input
                  type="radio"
                  name="iconStyle"
                  value={style}
                  checked={iconStyle === style}
                  onChange={() => setIconStyle(style)}
                />
                {style === 'line' ? 'Line' : 'Solid'}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Size</legend>
            {(['24px', '30px'] as const).map(size => (
              <label key={size}>
                <input
                  type="radio"
                  name="iconSize"
                  value={size}
                  checked={iconSize === size}
                  onChange={() => setIconSize(size)}
                />
                {size}
              </label>
            ))}
          </fieldset>
          <fieldset className="selection-control">
            <legend>Selection</legend>
            <button
              className={`selection-toggle${selectionMode ? ' selection-toggle-active' : ''}`}
              aria-pressed={selectionMode}
              onClick={() => setSelectionMode(enabled => !enabled)}
            >
              Select icons
            </button>
            <span className="selection-count">{selectedIcons.length} selected</span>
            <button
              className="selection-clear"
              onClick={() => setSelectedIcons([])}
              disabled={selectedIcons.length === 0 || exportState === 'exporting'}
            >
              Clear
            </button>
            <button
              className="header-export-button"
              onClick={() => setExportModalOpen(true)}
              disabled={selectedIcons.length === 0 || exportState === 'exporting'}
            >
              Export
            </button>
            <button
              className="header-export-button"
              onClick={() => handleDownloadExternalComponent()}
              disabled={exportState === 'exporting'}
            >
              Download External Icon Component
            </button>
          </fieldset>
        </div>
      </header>
      <main>
        {normalizedSearchQuery
          ? <SearchResults
              results={searchResults}
              query={normalizedSearchQuery}
              iconStyle={iconStyle}
              iconSize={iconSize}
              selectionMode={selectionMode}
              selectedIconIds={selectedIconIds}
              onSelectIcon={handleSelectIcon}
              onToggleSelectedIcon={handleToggleSelectedIcon}
            />
          : Object.entries(iconsIndexRef.current).map(([categoryName, icons]) => (
              <Category
                key={categoryName}
                name={categoryName}
                icons={icons}
                iconStyle={iconStyle}
                iconSize={iconSize}
                expanded={!!expandedCategories[categoryName]}
                onToggle={() => handleToggleCategory(categoryName)}
                onSelectIcon={handleSelectIcon}
                selectionMode={selectionMode}
                selectedIconIds={selectedIconIds}
                onToggleSelectedIcon={handleToggleSelectedIcon}
              />
            ))}
      </main>
      {selectedIcon && (
        <IconDetailsModal
          categoryName={selectedIcon.categoryName}
          name={selectedIcon.name}
          iconStyle={iconStyle}
          iconSize={iconSize}
          selected={selectedIconIds.has(iconId(selectedIcon.categoryName, selectedIcon.name))}
          onToggleSelected={() => handleToggleSelectedIcon(selectedIcon)}
          onClose={handleCloseModal}
        />
      )}
      {exportModalOpen && (
        <ExportPreviewModal
          selectedIcons={selectedIcons}
          iconsIndex={iconsIndexRef.current}
          exportState={exportState}
          onClose={() => setExportModalOpen(false)}
          onDownload={handleExport}
        />
      )}
      {exportState === 'error' && <p className="export-error">Export failed. Try again.</p>}
    </body>
  );
}

type ExportPreviewModalProps = {
  selectedIcons: SelectedIcon[];
  iconsIndex: IconsIndex;
  exportState: ExportState;
  onClose: () => void;
  onDownload: () => void;
};

function ExportPreviewModal({ selectedIcons, iconsIndex, exportState, onClose, onDownload }: ExportPreviewModalProps) {
  const iconInfo = new Map(Object.entries(iconsIndex)
    .flatMap(([categoryName, icons]) => icons.map(icon => [iconId(categoryName, icon.name), { categoryName, icon }] as const)));
  const variants = (['line', 'solid'] as const).flatMap(style => (['24px', '30px'] as const).map(size => ({ style, size })));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Export icons</h3>
            <p>{selectedIcons.length} selected icon{selectedIcons.length === 1 ? '' : 's'}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="export-variants">
          {variants.map(({ style, size }) => {
            const variant = iconVariant(style, size);
            const icons = selectedIcons.flatMap(selected => {
              const entry = iconInfo.get(iconId(selected.categoryName, selected.name));
              return entry?.icon.variants.includes(variant) ? [entry] : [];
            });

            return (
              <section className="export-variant" key={variant}>
                <h4>{style} / {size}<span>{icons.length}</span></h4>
                {icons.length > 0 ? (
                  <ul>
                    {icons.map(({ categoryName, icon }) => (
                      <li key={iconId(categoryName, icon.name)}>
                        <img src={getIconPath(style, categoryName, icon.name, size)} alt="" style={{ width: size, height: size }} />
                        <span>{icon.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="export-empty">No available icons</p>}
              </section>
            );
          })}
        </div>
        <div className="modal-footer export-modal-footer">
          <button className="selection-clear" onClick={onClose} disabled={exportState === 'exporting'}>Cancel</button>
          <button className="header-export-button" onClick={onDownload} disabled={exportState === 'exporting'}>
            {exportState === 'exporting' ? 'Preparing...' : 'Download icons.zip'}
          </button>
        </div>
      </div>
    </div>
  );
}

type SearchResultsProps = {
  results: SearchResult[];
  query: string;
  iconStyle: IconStyle;
  iconSize: IconSize;
  selectionMode: boolean;
  selectedIconIds: Set<string>;
  onSelectIcon: (icon: SelectedIcon) => void;
  onToggleSelectedIcon: (icon: SelectedIcon) => void;
};

function SearchResults({ results, query, iconStyle, iconSize, selectionMode, selectedIconIds, onSelectIcon, onToggleSelectedIcon }: SearchResultsProps) {
  if (!results.length) return <p className="no-results">No icons match “{query}”.</p>;

  return (
    <div className="search-results">
      {results.map(({ categoryName, icon }) => {
        const available = icon.variants.includes(iconVariant(iconStyle, iconSize));
        const selected = selectedIconIds.has(iconId(categoryName, icon.name));
        const iconLabel = { categoryName, name: icon.name };

        return (
          <div
            key={iconId(categoryName, icon.name)}
            className={`search-result${available ? '' : ' search-result-unavailable'}${selected ? ' search-result-selected' : ''}`}
            onClick={available ? () => selectionMode ? onToggleSelectedIcon(iconLabel) : onSelectIcon(iconLabel) : undefined}
            title={available ? icon.name : `${icon.name} is not available in ${iconStyle} ${iconSize}`}
          >
            {available
              ? <img src={getIconPath(iconStyle, categoryName, icon.name, iconSize)} alt="" style={{ width: iconSize, height: iconSize }} />
              : <span className="search-result-missing" aria-hidden="true">Unavailable</span>}
            <span>{highlightMatch(icon.name, query)}</span>
          </div>
        );
      })}
    </div>
  );
}

function highlightMatch(value: string, query: string) {
  const indexes = getMatchIndexes(value, query);
  if (!indexes) return value;

  const matchedIndexes = new Set(indexes);
  return [...value].map((character, index) => matchedIndexes.has(index)
    ? <mark key={index}>{character}</mark>
    : <span key={index}>{character}</span>);
}

type CategoryProps = {
  name: string;
  icons: IconInfo[];
  iconStyle: IconStyle;
  iconSize: IconSize;
  expanded: boolean;
  onToggle: () => void;
  onSelectIcon: (icon: SelectedIcon) => void;
  selectionMode: boolean;
  selectedIconIds: Set<string>;
  onToggleSelectedIcon: (icon: SelectedIcon) => void;
};

function Category({ name, icons, iconStyle, iconSize, expanded, onToggle, onSelectIcon, selectionMode, selectedIconIds, onToggleSelectedIcon }: CategoryProps) {
  return (
    <section id={categoryId(name)}>
      <h2 onClick={onToggle}>{name} {expanded ? '▼' : '▶'}</h2>
      {expanded && (
        <div className="icon-grid">
          {icons.map(icon => (
            <Icon
              key={icon.name}
              categoryName={name}
              icon={icon}
              style={iconStyle}
              size={iconSize}
              onSelect={onSelectIcon}
              selectionMode={selectionMode}
              selected={selectedIconIds.has(iconId(name, icon.name))}
              onToggleSelected={onToggleSelectedIcon}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type IconProps = {
  categoryName: string;
  icon: IconInfo;
  style: IconStyle;
  size: IconSize;
  onSelect: (icon: SelectedIcon) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelected: (icon: SelectedIcon) => void;
};

function Icon({ categoryName, icon, style, size, onSelect, selectionMode, selected, onToggleSelected }: IconProps) {
  const available = icon.variants.includes(iconVariant(style, size));

  return (
    <div
      id={iconId(categoryName, icon.name)}
      className={`icon-cell${available ? '' : ' icon-cell-unavailable'}${selected ? ' icon-cell-selected' : ''}`}
      onClick={available ? () => selectionMode ? onToggleSelected({ categoryName, name: icon.name }) : onSelect({ categoryName, name: icon.name }) : undefined}
      title={available ? `${icon.name}${selectionMode ? selected ? ' (selected)' : ' (select)' : ''}` : `${icon.name} is not available in ${style} ${size}`}
      aria-disabled={!available}
    >
      {available
        ? <img src={getIconPath(style, categoryName, icon.name, size)} alt={icon.name} style={{ width: size, height: size }} />
        : <span aria-hidden="true">Unavailable</span>}
    </div>
  );
}

type IconDetailsModalProps = {
  categoryName: string;
  name: string;
  iconStyle: IconStyle;
  iconSize: IconSize;
  selected: boolean;
  onToggleSelected: () => void;
  onClose: () => void;
};

function IconDetailsModal({ categoryName, name, iconStyle, iconSize, selected, onToggleSelected, onClose }: IconDetailsModalProps) {
  const iconPath = getIconPath(iconStyle, categoryName, name, iconSize);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <img src={iconPath} alt={name} className="modal-icon-preview" />
          <dl className="modal-details">
            <div>
              <dt>Category</dt>
              <dd>{categoryName}</dd>
            </div>
            <div>
              <dt>Style</dt>
              <dd>{iconStyle}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{iconSize}</dd>
            </div>
          </dl>
        </div>
        <div className="modal-footer">
          <code>{iconPath}</code>
          <button
            className={`modal-selection-button${selected ? ' modal-selection-remove' : ''}`}
            onClick={() => {
              onToggleSelected();
              onClose();
            }}
          >
            {selected ? 'Remove from selection' : 'Add to selection'}
          </button>
        </div>
      </div>
    </div>
  );
}
