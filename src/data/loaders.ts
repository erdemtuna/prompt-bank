import presetsRaw from '../../model-presets.yaml?raw';
import { parseModelPresets, parsePromptFile, validatePromptCollection, type ModelPreset, type Prompt, type PromptIdentity, type ValidationIssue } from './schemas';

const promptModules = import.meta.glob('../../prompts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const categoryOrder = ['writing', 'code', 'review', 'planning', 'analysis', 'cli'];

export type AppData = {
  prompts: Prompt[];
  presets: ModelPreset[];
  issues: ValidationIssue[];
};

export function loadAppData(): AppData {
  return loadAppDataFromSources(promptModules, presetsRaw);
}

export function loadAppDataFromSources(promptSources: Record<string, string>, modelPresetsRaw: string): AppData {
  const { presets, issues: presetIssues } = parseModelPresets('model-presets.yaml', modelPresetsRaw);
  const prompts: Prompt[] = [];
  const promptIdentities: PromptIdentity[] = [];
  const issues: ValidationIssue[] = [...presetIssues];

  for (const [path, raw] of Object.entries(promptSources)) {
    const result = parsePromptFile(path, raw);
    issues.push(...result.issues);
    if (result.promptIdentity) {
      promptIdentities.push(result.promptIdentity);
    }
    if (result.prompt) {
      prompts.push(result.prompt);
    }
  }

  issues.push(...validatePromptCollection(prompts, presets, { promptFileCount: Object.keys(promptSources).length, promptIdentities }));
  prompts.sort(comparePromptsForLibrary);

  return { prompts, presets, issues };
}

export function comparePromptsForLibrary(a: Prompt, b: Prompt): number {
  return compareCategoriesForLibrary(a.category, b.category) || a.title.localeCompare(b.title);
}

export function compareCategoriesForLibrary(a: string, b: string): number {
  const aIndex = categoryOrder.indexOf(a.toLocaleLowerCase());
  const bIndex = categoryOrder.indexOf(b.toLocaleLowerCase());
  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  }
  return a.localeCompare(b);
}
