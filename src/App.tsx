import { FluentProvider, Text, makeStyles, webLightTheme, type Theme } from '@fluentui/react-components';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { WorkspaceView } from './components/WorkspaceView';
import { builtinPresetsRaw, builtinPromptSources, resolvePromptsForApp, type PromptSourceInput } from './data/loaders';
import {
  isDesktop,
  listWorkspaces,
  openWorkspace,
  pickWorkspace,
  readGlobalPrompts,
  removeWorkspace,
  setWindowTitle,
  toCommandError,
  type WorkspaceSummaryDto
} from './data/desktopClient';

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
  accentBar: { flexShrink: 0, height: '3px', backgroundColor: 'var(--sw-accent)' },
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
    '@media (max-width: 900px)': { padding: '11px 20px' }
  },
  brand: { display: 'flex', alignItems: 'baseline', gap: '16px', minWidth: 0, flexWrap: 'wrap' },
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
    '@media (max-width: 560px)': { display: 'none' }
  },
  metaNum: { fontWeight: 700, color: 'var(--sw-ink)' },
  notice: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '1360px',
    margin: '0 auto',
    padding: '10px 40px',
    display: 'flex',
    gap: '12px',
    alignItems: 'baseline',
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    color: 'var(--sw-accent-strong)',
    '@media (max-width: 900px)': { padding: '10px 20px' }
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
    '@media (max-width: 900px)': { gridTemplateColumns: '1fr', padding: '0 20px 40px' }
  }
});

type LoadState = 'loading' | 'ready' | 'error';

type Tab = {
  id: string;
  kind: 'library' | 'folder';
  label: string;
  folderSource?: PromptSourceInput;
  state: LoadState;
  error?: string;
  selectedKey?: string;
  loadSeq?: number;
};

const builtinSource = builtinPromptSources();
const presetsRaw = builtinPresetsRaw();
const LIBRARY_TAB: Tab = { id: 'library', kind: 'library', label: 'Library', state: 'ready' };

export default function App() {
  const styles = useStyles();
  const desktop = isDesktop();

  const [globalSource, setGlobalSource] = useState<PromptSourceInput | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([LIBRARY_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>('library');
  const [recents, setRecents] = useState<WorkspaceSummaryDto[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const loadSeqRef = useRef(0);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const node = headerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setHeaderHeight(entry.target.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    readGlobalPrompts()
      .then((source) => {
        if (!cancelled) setGlobalSource(source);
      })
      .catch((error) => {
        if (!cancelled) setNotice(`Global prompts could not load: ${toCommandError(error).message}`);
      });
    listWorkspaces()
      .then((list) => {
        if (!cancelled) setRecents(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    if (!desktop) return;
    const title = activeTab.kind === 'library' ? 'Prompt Bank' : `Prompt Bank: ${activeTab.label}`;
    setWindowTitle(title).catch(() => {});
  }, [desktop, activeTab.id, activeTab.kind, activeTab.label]);

  const data = useMemo(() => {
    // A folder tab is scoped to its own prompts only. Built in and global prompts
    // are the shared defaults and live in the Library tab, so a folder workspace
    // never mixes them in, and with a single source it shows no source sub-tabs.
    if (activeTab.kind === 'folder') {
      return resolvePromptsForApp(activeTab.folderSource ? [activeTab.folderSource] : [], presetsRaw);
    }
    const sources = [builtinSource];
    if (globalSource) sources.push(globalSource);
    return resolvePromptsForApp(sources, presetsRaw);
  }, [globalSource, activeTab.id, activeTab.kind, activeTab.folderSource]);

  const folderPending = activeTab.kind === 'folder' && !activeTab.folderSource;

  function setSelectedKey(key: string) {
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, selectedKey: key } : tab)));
  }

  function refreshRecents() {
    listWorkspaces()
      .then(setRecents)
      .catch(() => {});
  }

  function loadFolderInto(id: string) {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setTabs((prev) => prev.map((tab) => (tab.id === id ? { ...tab, state: 'loading', loadSeq: seq, error: undefined } : tab)));
    openWorkspace(id)
      .then((result) => {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === id && tab.loadSeq === seq
              ? { ...tab, state: 'ready', label: result.label, folderSource: result.source }
              : tab
          )
        );
      })
      .catch((error) => {
        const message = toCommandError(error).message;
        setTabs((prev) => prev.map((tab) => (tab.id === id && tab.loadSeq === seq ? { ...tab, state: 'error', error: message } : tab)));
      });
  }

  function openRecent(id: string) {
    if (tabs.some((tab) => tab.id === id)) {
      setActiveTabId(id);
      return;
    }
    const recent = recents.find((entry) => entry.id === id);
    setTabs((prev) => [...prev, { id, kind: 'folder', label: recent?.label ?? 'workspace', state: 'loading' }]);
    setActiveTabId(id);
    loadFolderInto(id);
  }

  function openFolder() {
    setNotice(null);
    pickWorkspace()
      .then((result) => {
        if (!result) return;
        // Bump the sequence so any in-flight open_workspace for this id cannot
        // later turn this freshly picked, ready tab into an error.
        const seq = loadSeqRef.current + 1;
        loadSeqRef.current = seq;
        setTabs((prev) => {
          if (prev.some((tab) => tab.id === result.workspaceId)) {
            return prev.map((tab) =>
              tab.id === result.workspaceId
                ? { ...tab, state: 'ready', label: result.label, folderSource: result.source, error: undefined, loadSeq: seq }
                : tab
            );
          }
          return [...prev, { id: result.workspaceId, kind: 'folder', label: result.label, folderSource: result.source, state: 'ready', loadSeq: seq }];
        });
        setActiveTabId(result.workspaceId);
        refreshRecents();
      })
      .catch((error) => setNotice(`That folder could not be opened: ${toCommandError(error).message}`));
  }

  function forgetRecent(id: string) {
    removeWorkspace(id)
      .then(setRecents)
      .catch((error) => setNotice(`That folder could not be forgotten: ${toCommandError(error).message}`));
  }

  function closeTab(id: string) {
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (activeTabId === id) {
      const fallback = next[Math.max(0, index - 1)] ?? next[0];
      setActiveTabId(fallback?.id ?? 'library');
    }
  }

  const promptCountLabel = String(data.prompts.length).padStart(2, '0');

  return (
    <FluentProvider theme={swissTheme}>
      <div className={styles.app}>
        <div className={styles.accentBar} />
      <header className={styles.masthead} ref={headerRef}>
        <div className={styles.mastheadInner}>
          <div className={styles.brand}>
            <h1 className={styles.wordmark}>Prompt&nbsp;Bank</h1>
            <span className={styles.tagline}>File-backed prompt library — copy only</span>
          </div>
          <span className={styles.mastheadMeta}>
            <span className={styles.metaNum}>{promptCountLabel}</span> Prompts
          </span>
        </div>
        {desktop ? (
          <WorkspaceTabs
            tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, closable: tab.kind === 'folder', busy: tab.state === 'loading' }))}
            activeTabId={activeTabId}
            recents={recents}
            onSelectTab={setActiveTabId}
            onCloseTab={closeTab}
            onOpenFolder={openFolder}
            onOpenRecent={openRecent}
            onForgetRecent={forgetRecent}
          />
        ) : null}
        {notice ? (
          <div className={styles.notice} role="status">
            <span>{notice}</span>
          </div>
        ) : null}
        {activeTab.state === 'error' ? (
          <div className={styles.notice} role="alert">
            <span>This folder could not be read: {activeTab.error}</span>
            <button type="button" onClick={() => loadFolderInto(activeTab.id)}>
              Retry
            </button>
          </div>
        ) : activeTab.state === 'loading' ? (
          <div className={styles.notice} role="status">
            <span>Loading {activeTab.label} prompts…</span>
          </div>
        ) : null}
      </header>

      <main
        className={styles.main}
        aria-label={desktop ? `${activeTab.label} workspace` : undefined}
        style={headerHeight ? ({ ['--pb-header-height']: `${headerHeight}px` } as CSSProperties) : undefined}
      >
        {folderPending ? (
          activeTab.state === 'loading' ? <Text>Loading prompts…</Text> : null
        ) : data.prompts.length === 0 ? (
          <Text>No prompt Markdown files were found.</Text>
        ) : (
          <WorkspaceView
            data={data}
            search={search}
            category={category}
            sourceFilter={sourceFilter}
            selectedPromptKey={activeTab.selectedKey}
            onSearchChange={setSearch}
            onCategoryChange={setCategory}
            onSourceChange={setSourceFilter}
            onSelectPrompt={setSelectedKey}
          />
        )}
      </main>
      </div>
    </FluentProvider>
  );
}
