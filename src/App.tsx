import { Button, FluentProvider, Text, makeStyles, webLightTheme, type Theme } from '@fluentui/react-components';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Composer } from './components/Composer';
import { PromptLibrary } from './components/PromptLibrary';
import { compareCategoriesForLibrary, loadAppData } from './data/loaders';

const SANS = "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";
const ACCENT = '#e5391c';
const ACCENT_HOVER = '#cf2f14';
const ACCENT_PRESSED = '#b32910';

const swissTheme: Theme = {
  ...webLightTheme,
  fontFamilyBase: SANS,
  fontFamilyMonospace: MONO,
  colorBrandBackground: ACCENT,
  colorBrandBackgroundHover: ACCENT_HOVER,
  colorBrandBackgroundPressed: ACCENT_PRESSED,
  colorBrandBackgroundSelected: ACCENT,
  colorCompoundBrandBackground: ACCENT,
  colorCompoundBrandBackgroundHover: ACCENT_HOVER,
  colorCompoundBrandBackgroundPressed: ACCENT_PRESSED,
  colorCompoundBrandStroke: ACCENT,
  colorCompoundBrandStrokeHover: ACCENT_HOVER,
  colorCompoundBrandStrokePressed: ACCENT_PRESSED,
  colorBrandStroke1: ACCENT,
  colorBrandStroke2: ACCENT,
  colorBrandForeground1: ACCENT,
  colorBrandForeground2: ACCENT_HOVER,
  colorNeutralForegroundOnBrand: '#ffffff',
  colorStrokeFocus2: ACCENT
};

const useStyles = makeStyles({
  app: {
    minHeight: '100vh',
    backgroundColor: 'var(--sw-paper)',
    color: 'var(--sw-ink)',
    fontFamily: 'var(--sw-sans)',
    '@media (min-width: 1101px)': {
      height: '100vh',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }
  },
  accentBar: {
    flexShrink: 0,
    height: '3px',
    backgroundColor: 'var(--sw-accent)'
  },
  masthead: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    flexShrink: 0,
    backgroundColor: 'var(--sw-paper)',
    borderBottom: '1px solid var(--sw-rule)'
  },
  mastheadInner: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '1360px',
    margin: '0 auto',
    padding: '12px 40px',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '20px',
    '@media (max-width: 900px)': {
      padding: '11px 20px'
    }
  },
  brand: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '16px',
    minWidth: 0,
    flexWrap: 'wrap'
  },
  wordmark: {
    margin: 0,
    fontFamily: 'var(--sw-sans)',
    fontWeight: 800,
    fontSize: '20px',
    lineHeight: 1,
    letterSpacing: '-0.02em',
    textTransform: 'uppercase',
    color: 'var(--sw-ink)'
  },
  tagline: {
    fontFamily: 'var(--sw-mono)',
    fontWeight: 500,
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  mastheadMeta: {
    flexShrink: 0,
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)',
    '@media (max-width: 560px)': {
      display: 'none'
    }
  },
  metaNum: {
    fontWeight: 700,
    color: 'var(--sw-ink)'
  },
  main: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '1360px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'minmax(300px, 360px) minmax(0, 1fr)',
    alignItems: 'start',
    padding: '0 40px 40px',
    '@media (min-width: 1101px)': {
      flex: 1,
      minHeight: 0,
      alignItems: 'stretch',
      padding: '0 40px 28px',
      overflow: 'hidden'
    },
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr',
      padding: '0 20px 40px'
    }
  },
  content: {
    display: 'grid',
    gap: '20px',
    alignContent: 'start',
    minWidth: 0,
    boxSizing: 'border-box',
    paddingTop: '24px',
    paddingLeft: '48px',
    borderLeft: '1px solid var(--sw-rule)',
    '@media (min-width: 1101px)': {
      minHeight: 0,
      height: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    },
    '@media (max-width: 900px)': {
      paddingLeft: 0,
      paddingTop: '24px',
      borderLeft: 'none',
      borderTop: '1px solid var(--sw-rule)'
    }
  },
  errors: {
    display: 'grid',
    gap: '12px',
    marginBottom: '8px'
  },
  noticeCard: {
    display: 'grid',
    gap: '10px',
    padding: '16px 18px',
    backgroundColor: 'var(--sw-fill)',
    borderLeft: '3px solid var(--sw-accent)'
  },
  noticeEyebrow: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--sw-accent-strong)'
  },
  noticeActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  emptyCard: {
    padding: '20px',
    border: '1px solid var(--sw-rule)',
    color: 'var(--sw-muted)'
  }
});

const data = loadAppData();
const sourceOrder = ['builtin', 'global', 'folder'] as const;

export default function App() {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedPromptKey, setSelectedPromptKey] = useState<string | undefined>(data.prompts[0]?.key);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const node = headerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setHeaderHeight(entry.target.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const categories = useMemo(() => [...new Set(data.prompts.map((prompt) => prompt.category))].sort(compareCategoriesForLibrary), []);
  const availableSources = useMemo(() => sourceOrder.filter((source) => data.prompts.some((prompt) => prompt.source === source)), []);
  const showSourceFilter = availableSources.some((source) => source !== 'builtin');
  const sourceOptions = useMemo(() => [
    { value: 'all', label: 'All' },
    ...availableSources.map((source) => ({ value: source, label: data.prompts.find((prompt) => prompt.source === source)?.sourceLabel ?? source }))
  ], [availableSources]);
  const filteredPrompts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return data.prompts.filter((prompt) => {
      const categoryMatches = category === 'all' || prompt.category === category;
      const sourceMatches = sourceFilter === 'all' || prompt.source === sourceFilter;
      const searchMatches = !query || [prompt.title, prompt.description, prompt.category, prompt.tags.join(' '), prompt.template].join(' ').toLocaleLowerCase().includes(query);
      return categoryMatches && sourceMatches && searchMatches;
    });
  }, [category, search, sourceFilter]);
  const selectedPrompt = data.prompts.find((prompt) => prompt.key === selectedPromptKey) ?? data.prompts[0];
  const selectedPromptIsVisible = Boolean(selectedPrompt && filteredPrompts.some((prompt) => prompt.key === selectedPrompt.key));
  const filtersAreActive = Boolean(search.trim()) || category !== 'all' || sourceFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setCategory('all');
    setSourceFilter('all');
  }

  function showSelectedPrompt() {
    if (!selectedPrompt) return;
    setSearch('');
    setCategory(selectedPrompt.category);
    setSourceFilter('all');
  }

  const promptCountLabel = String(data.prompts.length).padStart(2, '0');

  return (
    <FluentProvider theme={swissTheme} className={styles.app}>
      <div className={styles.accentBar} />
      <header className={styles.masthead} ref={headerRef}>
        <div className={styles.mastheadInner}>
          <div className={styles.brand}>
            <h1 className={styles.wordmark}>Prompt&nbsp;Bank</h1>
            <span className={styles.tagline}>File-backed prompt library — copy only</span>
          </div>
          <span className={styles.mastheadMeta}><span className={styles.metaNum}>{promptCountLabel}</span> Prompts</span>
        </div>
      </header>

      <main className={styles.main} style={headerHeight ? ({ ['--pb-header-height']: `${headerHeight}px` } as CSSProperties) : undefined}>
        <PromptLibrary
          prompts={filteredPrompts}
          categories={categories}
          selectedPromptKey={selectedPromptKey}
          search={search}
          category={category}
          sourceFilter={sourceFilter}
          sourceOptions={sourceOptions}
          showSourceFilter={showSourceFilter}
          totalPromptCount={data.prompts.length}
          selectedPromptHidden={Boolean(selectedPrompt && !selectedPromptIsVisible && filtersAreActive)}
          onSearchChange={setSearch}
          onCategoryChange={setCategory}
          onSourceChange={setSourceFilter}
          onSelectPrompt={setSelectedPromptKey}
          onClearFilters={clearFilters}
          onShowSelectedPrompt={showSelectedPrompt}
        />

        <section className={styles.content} aria-label="Prompt workspace">
          {data.issues.length > 0 ? (
            <div className={styles.errors}>
              {data.issues.map((issue, index) => (
                <div key={`${issue.path}-${issue.message}-${index}`} className={styles.noticeCard}>
                  <Text className={styles.noticeEyebrow}>Validation issue</Text>
                  <Text block>{issue.path ? `${issue.path}: ` : ''}{issue.message}</Text>
                </div>
              ))}
            </div>
          ) : null}

          {data.prompts.length === 0 ? (
            <div className={styles.emptyCard}><Text>No prompt Markdown files were found under prompts.</Text></div>
          ) : (
            <>
              {selectedPrompt && !selectedPromptIsVisible && filtersAreActive ? (
                <div className={styles.noticeCard}>
                  <Text className={styles.noticeEyebrow}>Hidden by filters</Text>
                  <Text>The workspace is preserving your selected prompt. Clear filters or show its category to make it visible in the index again.</Text>
                  <div className={styles.noticeActions}>
                    <Button appearance="primary" onClick={clearFilters}>Clear filters</Button>
                    <Button onClick={showSelectedPrompt}>Show selected</Button>
                  </div>
                </div>
              ) : null}
              <Composer prompt={selectedPrompt} presets={data.presets} issues={data.issues} />
            </>
          )}
        </section>
      </main>
    </FluentProvider>
  );
}
