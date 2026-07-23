import { Button, Text, makeStyles } from '@fluentui/react-components';
import { useMemo } from 'react';
import { Composer } from './Composer';
import { PromptLibrary } from './PromptLibrary';
import { compareCategoriesForLibrary } from '../data/loaders';
import type { AppData } from '../data/loaders';

const sourceOrder = ['builtin', 'global', 'folder'] as const;

const useStyles = makeStyles({
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

type Props = {
  data: AppData;
  search: string;
  category: string;
  sourceFilter: string;
  selectedPromptKey?: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSelectPrompt: (key: string) => void;
};

export function WorkspaceView({
  data,
  search,
  category,
  sourceFilter,
  selectedPromptKey,
  onSearchChange,
  onCategoryChange,
  onSourceChange,
  onSelectPrompt
}: Props) {
  const styles = useStyles();

  const categories = useMemo(
    () => [...new Set(data.prompts.map((prompt) => prompt.category))].sort(compareCategoriesForLibrary),
    [data.prompts]
  );
  const availableSources = useMemo(
    () => sourceOrder.filter((source) => data.prompts.some((prompt) => prompt.source === source)),
    [data.prompts]
  );
  const showSourceFilter = availableSources.some((source) => source !== 'builtin');
  const sourceOptions = useMemo(
    () => [
      { value: 'all', label: 'All' },
      ...availableSources.map((source) => ({
        value: source,
        label: data.prompts.find((prompt) => prompt.source === source)?.sourceLabel ?? source
      }))
    ],
    [availableSources, data.prompts]
  );

  const filteredPrompts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return data.prompts.filter((prompt) => {
      const categoryMatches = category === 'all' || prompt.category === category;
      const sourceMatches = sourceFilter === 'all' || prompt.source === sourceFilter;
      const searchMatches =
        !query ||
        [prompt.title, prompt.description, prompt.category, prompt.tags.join(' '), prompt.template]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query);
      return categoryMatches && sourceMatches && searchMatches;
    });
  }, [category, data.prompts, search, sourceFilter]);

  const selectedPrompt = data.prompts.find((prompt) => prompt.key === selectedPromptKey) ?? data.prompts[0];
  const selectedPromptIsVisible = Boolean(
    selectedPrompt && filteredPrompts.some((prompt) => prompt.key === selectedPrompt.key)
  );
  const filtersAreActive = Boolean(search.trim()) || category !== 'all' || sourceFilter !== 'all';

  function clearFilters() {
    onSearchChange('');
    onCategoryChange('all');
    onSourceChange('all');
  }

  function showSelectedPrompt() {
    if (!selectedPrompt) return;
    onSearchChange('');
    onSourceChange('all');
    onCategoryChange(selectedPrompt.category);
  }

  return (
    <>
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
        onSearchChange={onSearchChange}
        onCategoryChange={onCategoryChange}
        onSourceChange={onSourceChange}
        onSelectPrompt={onSelectPrompt}
        onClearFilters={clearFilters}
        onShowSelectedPrompt={showSelectedPrompt}
      />

      <section className={styles.content} aria-label="Prompt workspace">
        {data.issues.length > 0 ? (
          <div className={styles.errors}>
            {data.issues.map((issue, index) => (
              <div key={`${issue.path}-${issue.message}-${index}`} className={styles.noticeCard}>
                <Text className={styles.noticeEyebrow}>Validation issue</Text>
                <Text block>
                  {issue.path ? `${issue.path}: ` : ''}
                  {issue.message}
                </Text>
              </div>
            ))}
          </div>
        ) : null}

        {data.prompts.length === 0 ? (
          <div className={styles.emptyCard}>
            <Text>No prompts are available in this view.</Text>
          </div>
        ) : (
          <>
            {selectedPrompt && !selectedPromptIsVisible && filtersAreActive ? (
              <div className={styles.noticeCard}>
                <Text className={styles.noticeEyebrow}>Hidden by filters</Text>
                <Text>
                  The workspace is preserving your selected prompt. Clear filters or show its category to make it
                  visible in the index again.
                </Text>
                <div className={styles.noticeActions}>
                  <Button appearance="primary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                  <Button onClick={showSelectedPrompt}>Show selected</Button>
                </div>
              </div>
            ) : null}
            <Composer prompt={selectedPrompt} presets={data.presets} issues={data.issues} />
          </>
        )}
      </section>
    </>
  );
}
