import { Input, Text, makeStyles } from '@fluentui/react-components';
import type { Prompt } from '../data/schemas';
import { formatCount } from './promptUi';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    paddingTop: '24px',
    paddingRight: '32px',
    '@media (max-width: 900px)': {
      paddingRight: 0,
      paddingTop: '24px'
    },
    '@media (min-width: 901px) and (max-width: 1100px)': {
      position: 'sticky',
      top: 'calc(var(--pb-header-height, 7rem) + 0px)',
      maxHeight: 'calc(100vh - var(--pb-header-height, 7rem))',
      overflow: 'hidden'
    },
    '@media (min-width: 1101px)': {
      height: '100%',
      minHeight: 0,
      overflow: 'hidden'
    }
  },
  controls: {
    display: 'grid',
    gap: '16px',
    flexShrink: 0
  },
  search: {
    width: '100%',
    backgroundColor: 'transparent',
    '& input': {
      fontFamily: 'var(--sw-mono)',
      fontSize: '13px',
      letterSpacing: '0.02em',
      color: 'var(--sw-ink)'
    },
    '& input::placeholder': {
      fontFamily: 'var(--sw-mono)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontSize: '12px',
      color: 'var(--sw-muted)'
    }
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: '14px',
    rowGap: '8px',
    alignItems: 'center'
  },
  filter: {
    appearance: 'none',
    border: 'none',
    background: 'none',
    padding: '2px 0',
    cursor: 'pointer',
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)',
    borderBottom: '2px solid transparent',
    transitionProperty: 'color, border-color',
    transitionDuration: '120ms',
    ':hover': {
      color: 'var(--sw-ink)'
    },
    ':focus-visible': {
      outline: '2px solid var(--sw-accent)',
      outlineOffset: '3px'
    }
  },
  filterActive: {
    color: 'var(--sw-ink)',
    borderBottom: '2px solid var(--sw-accent)'
  },
  summary: {
    marginTop: '12px',
    marginBottom: '4px',
    flexShrink: 0,
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'auto',
    minHeight: 0,
    borderTop: '1px solid var(--sw-rule)'
  },
  row: {
    appearance: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: '30px minmax(0, 1fr)',
    columnGap: '14px',
    alignItems: 'start',
    padding: '14px 14px 14px 11px',
    background: 'none',
    borderTop: 'none',
    borderRight: 'none',
    borderBottom: '1px solid var(--sw-rule)',
    borderLeft: '3px solid transparent',
    fontFamily: 'var(--sw-sans)',
    color: 'var(--sw-ink)',
    transitionProperty: 'background-color, border-color',
    transitionDuration: '120ms',
    ':hover': {
      backgroundColor: 'var(--sw-fill)'
    },
    ':focus-visible': {
      outline: '2px solid var(--sw-accent)',
      outlineOffset: '-2px'
    }
  },
  rowSelected: {
    backgroundColor: 'var(--sw-fill)',
    borderLeft: '3px solid var(--sw-accent)'
  },
  num: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '20px',
    color: 'var(--sw-muted)',
    fontVariantNumeric: 'tabular-nums'
  },
  numSelected: {
    color: 'var(--sw-accent-strong)'
  },
  body: {
    display: 'grid',
    gap: '6px',
    minWidth: 0
  },
  title: {
    fontFamily: 'var(--sw-sans)',
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: '20px',
    letterSpacing: '-0.01em',
    color: 'var(--sw-ink)'
  },
  meta: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  empty: {
    display: 'grid',
    gap: '12px',
    padding: '24px 14px'
  },
  emptyText: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    letterSpacing: '0.06em',
    color: 'var(--sw-muted)'
  },
  emptyActions: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap'
  }
});

type Props = {
  prompts: Prompt[];
  categories: string[];
  selectedPromptKey?: string;
  search: string;
  category: string;
  totalPromptCount: number;
  selectedPromptHidden: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSelectPrompt: (promptKey: string) => void;
  onClearFilters: () => void;
  onShowSelectedPrompt: () => void;
};

export function PromptLibrary({
  prompts,
  categories,
  selectedPromptKey,
  search,
  category,
  totalPromptCount,
  selectedPromptHidden,
  onSearchChange,
  onCategoryChange,
  onSelectPrompt,
  onClearFilters,
  onShowSelectedPrompt
}: Props) {
  const styles = useStyles();
  const filtersAreActive = Boolean(search.trim()) || category !== 'all';
  const resultSummary = filtersAreActive
    ? `${String(prompts.length).padStart(2, '0')} / ${String(totalPromptCount).padStart(2, '0')} match`
    : `Index — ${String(totalPromptCount).padStart(2, '0')} prompts`;

  const filterOptions = ['all', ...categories];

  return (
    <section className={styles.panel} aria-label="Prompt library">
      <div className={styles.controls}>
        <Input
          appearance="underline"
          className={styles.search}
          aria-label="Search prompts"
          placeholder="Search"
          value={search}
          onChange={(_, data) => onSearchChange(data.value)}
        />
        <div className={styles.filters} role="group" aria-label="Filter by category">
          {filterOptions.map((item) => {
            const isActive = category === item;
            return (
              <button
                key={item}
                type="button"
                className={isActive ? `${styles.filter} ${styles.filterActive}` : styles.filter}
                aria-pressed={isActive}
                onClick={() => onCategoryChange(item)}
              >
                {item === 'all' ? 'All' : item}
              </button>
            );
          })}
        </div>
      </div>

      <Text className={styles.summary} role="status" aria-live="polite" aria-atomic="true">
        {resultSummary}
        {selectedPromptHidden ? ' · selection hidden' : ''}
      </Text>

      <div className={styles.list}>
        {prompts.length === 0 ? (
          <div className={styles.empty}>
            <Text className={styles.emptyText}>No prompts match the current filters.</Text>
            <div className={styles.emptyActions}>
              <button type="button" className={`${styles.filter} ${styles.filterActive}`} onClick={onClearFilters}>Clear filters</button>
              {selectedPromptHidden ? <button type="button" className={styles.filter} onClick={onShowSelectedPrompt}>Show selected</button> : null}
            </div>
          </div>
        ) : prompts.map((prompt, index) => {
          const isSelected = prompt.path === selectedPromptKey;
          const number = String(index + 1).padStart(2, '0');
          const metaParts = [prompt.category];
          if (prompt.kind === 'command') metaParts.push('command');
          if (prompt.variables.length > 0) metaParts.push(formatCount(prompt.variables.length, 'input'));

          return (
            <button
              type="button"
              key={prompt.path}
              className={isSelected ? `${styles.row} ${styles.rowSelected}` : styles.row}
              aria-pressed={isSelected}
              aria-current={isSelected ? 'true' : undefined}
              aria-label={`${prompt.title}${isSelected ? ', selected' : ''}`}
              onClick={() => onSelectPrompt(prompt.path)}
            >
              <span className={isSelected ? `${styles.num} ${styles.numSelected}` : styles.num}>{number}</span>
              <span className={styles.body}>
                <span className={styles.title}>{prompt.title}</span>
                <span className={styles.meta}>{metaParts.join(' — ')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
