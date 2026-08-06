import type { PromptVariable } from '../data/schemas';

/** The label for the primary shortcut modifier on this platform. */
export const shortcutModifier: string =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? 'Cmd' : 'Ctrl';

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function shouldUseTextarea(variable: PromptVariable): boolean {
  const defaultValue = variable.defaultValue ?? '';
  const description = variable.description?.toLowerCase() ?? '';
  const name = variable.name.toLowerCase();

  // Free-form operator inputs are usually a sentence or a list of paths, so they
  // get a textarea. Short, single-token values such as a branch or a path stay
  // as inputs.
  const freeFormNames = [
    'context',
    'comments',
    'summary',
    'instructions',
    'intent',
    'goal',
    'target',
    'outcome',
    'area',
    'decision',
    'approach',
    'draft',
    'source',
    'symptom',
    'constraints',
    'invariants',
    'criteria'
  ];

  return (
    defaultValue.includes('\n') ||
    defaultValue.length > 60 ||
    description.includes('context') ||
    description.includes('comments') ||
    description.includes('summary') ||
    description.includes('instructions') ||
    description.includes('files') ||
    freeFormNames.some((token) => name.includes(token))
  );
}
