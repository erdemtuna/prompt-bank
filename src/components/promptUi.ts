import type { PromptVariable } from '../data/schemas';

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function shouldUseTextarea(variable: PromptVariable): boolean {
  const defaultValue = variable.defaultValue ?? '';
  const description = variable.description?.toLowerCase() ?? '';
  const name = variable.name.toLowerCase();

  return (
    defaultValue.includes('\n') ||
    defaultValue.length > 90 ||
    description.includes('context') ||
    description.includes('comments') ||
    description.includes('summary') ||
    description.includes('instructions') ||
    description.includes('files') ||
    name.includes('context') ||
    name.includes('comments') ||
    name.includes('summary') ||
    name.includes('instructions')
  );
}
