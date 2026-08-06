import { makeStyles } from '@fluentui/react-components';
import { useState } from 'react';

const EXAMPLE_PROMPT = `---
id: my-prompt
title: My Prompt
category: writing
description: What this prompt is for
variables:
  - name: topic
    description: The subject to write about
    required: true
---

Write a short note about {{topic}}.
`;

const useStyles = makeStyles({
  wrap: {
    gridColumn: '1 / -1',
    display: 'grid',
    gap: '18px',
    alignContent: 'start',
    maxWidth: '640px',
    padding: '28px 0'
  },
  eyebrow: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--sw-accent-strong)'
  },
  heading: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: 'var(--sw-ink)'
  },
  body: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'var(--sw-muted)'
  },
  pathList: {
    display: 'grid',
    gap: '8px',
    margin: 0,
    padding: 0,
    listStyle: 'none'
  },
  pathRow: {
    display: 'grid',
    gap: '2px'
  },
  pathLabel: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '10px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  path: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '12.5px',
    color: 'var(--sw-ink)',
    wordBreak: 'break-all'
  },
  exampleFrame: {
    display: 'grid',
    gap: '8px'
  },
  exampleHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
    borderBottom: '1px solid var(--sw-rule)',
    paddingBottom: '6px'
  },
  example: {
    margin: 0,
    padding: '14px 16px',
    backgroundColor: 'var(--sw-panel)',
    borderLeft: '3px solid var(--sw-ink)',
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    lineHeight: 1.6,
    color: 'var(--sw-ink)',
    overflowX: 'auto'
  },
  copyLink: {
    appearance: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--sw-accent-strong)',
    ':hover': { textDecoration: 'underline' }
  },
  footnote: {
    margin: 0,
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    lineHeight: 1.7,
    color: 'var(--sw-muted)'
  }
});

type Props = {
  /** A folder workspace names the folder; the library covers the global set. */
  scope: 'library' | 'folder';
  folderLabel?: string;
};

export function EmptyPrompts({ scope, folderLabel }: Props) {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const isFolder = scope === 'folder';

  return (
    <div className={styles.wrap}>
      <span className={styles.eyebrow}>No prompts yet</span>
      <h2 className={styles.heading}>
        {isFolder ? `${folderLabel ?? 'This folder'} has no prompts yet` : 'Nothing to compose yet'}
      </h2>
      <p className={styles.body}>
        A prompt is a Markdown file. Declare the parts that change as variables and optional sections, and Prompt Bank
        turns it into a form you fill in and paste.
      </p>
      <p className={styles.body}>
        {isFolder
          ? 'Prompt Bank reads those files from a .prompt-bank directory inside the folder you opened. Create one, drop a prompt in it, and press Refresh.'
          : 'Prompt Bank reads those files from disk. Add one in either place below, then press Refresh.'}
      </p>

      <ul className={styles.pathList}>
        {isFolder ? (
          <li className={styles.pathRow}>
            <span className={styles.pathLabel}>Folder</span>
            <span className={styles.path}>&lt;this folder&gt;/.prompt-bank/&lt;category&gt;/your-prompt.md</span>
          </li>
        ) : (
          <>
            <li className={styles.pathRow}>
              <span className={styles.pathLabel}>Global</span>
              <span className={styles.path}>~/.prompt-bank/&lt;category&gt;/your-prompt.md</span>
            </li>
            <li className={styles.pathRow}>
              <span className={styles.pathLabel}>Folder</span>
              <span className={styles.path}>&lt;a folder you open&gt;/.prompt-bank/&lt;category&gt;/your-prompt.md</span>
            </li>
          </>
        )}
      </ul>

      <div className={styles.exampleFrame}>
        <div className={styles.exampleHeader}>
          <span className={styles.pathLabel}>A prompt that works</span>
          <button type="button" className={styles.copyLink} onClick={copyExample}>
            {copied ? 'Copied' : 'Copy example'}
          </button>
        </div>
        <pre className={styles.example}>{EXAMPLE_PROMPT}</pre>
      </div>

      <p className={styles.footnote}>
        Category is the folder name and is a free label. The full contract is in schema.md, and docs/authoring.md walks
        through variables, optional focus blocks, and model presets.
      </p>
    </div>
  );
}
