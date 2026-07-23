import presetsRaw from '../../model-presets.yaml?raw';
import { defaultModelIssues, parseModelPresets, parsePromptFile, type ModelPreset, type Prompt, type PromptSource, type ValidationIssue } from './schemas';

const promptModules = import.meta.glob('../../prompts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const categoryOrder = ['writing', 'code', 'review', 'planning', 'analysis', 'cli'];

export const sourceLabels: Record<PromptSource, string> = {
  builtin: 'Built in',
  global: 'Global',
  folder: 'Folder'
};

/**
 * One layer of prompt files with its provenance. The built in layer ships with
 * the app; global and folder layers are read at runtime and passed in here. The
 * plain map form is still accepted for the shipped built in set and existing
 * callers, and is normalized to a single built in source with byte for byte paths.
 */
export type PromptSourceInput = {
  source: PromptSource;
  sourceLabel?: string;
  instanceId?: string;
  files: Record<string, string>;
};

export type AppData = {
  prompts: Prompt[];
  presets: ModelPreset[];
  issues: ValidationIssue[];
};

export function builtinPromptSources(): PromptSourceInput {
  return { source: 'builtin', sourceLabel: sourceLabels.builtin, files: promptModules };
}

export function builtinPresetsRaw(): string {
  return presetsRaw;
}

export function loadAppData(): AppData {
  return resolvePromptsForApp([builtinPromptSources()], builtinPresetsRaw());
}

export function loadAppDataFromSources(
  input: Record<string, string> | PromptSourceInput | PromptSourceInput[],
  modelPresetsRaw: string
): AppData {
  return resolvePromptsForApp(normalizeSources(input), modelPresetsRaw);
}

/**
 * Resolve the prompts shown in the running app across every source. Within one
 * source a duplicate id is resolved deterministically and quietly, so a repeated
 * id in a private folder cannot block the app. The same id across two sources is
 * kept, each carrying its source label. The strict within source duplicate error
 * lives in validatePromptCollection, which the shipped validator uses.
 */
export function resolvePromptsForApp(sources: PromptSourceInput[], modelPresetsRaw: string): AppData {
  const { presets, issues: presetIssues } = parseModelPresets('model-presets.yaml', modelPresetsRaw);
  const issues: ValidationIssue[] = [...presetIssues];
  const resolved: Prompt[] = [];
  let fileCount = 0;

  for (const source of sources) {
    const sourceLabel = source.sourceLabel ?? sourceLabels[source.source];
    for (const [path, raw] of Object.entries(source.files)) {
      fileCount += 1;
      const key = qualifiedKey(source, path);
      const result = parsePromptFile(path, raw);
      issues.push(...result.issues.map((issue) => ({ ...issue, promptKey: key })));
      if (result.prompt) {
        resolved.push({ ...result.prompt, source: source.source, sourceLabel, key });
      }
    }
  }

  const prompts = dedupeWithinSource(resolved);

  if (fileCount === 0) {
    issues.push({ scope: 'global', message: 'No prompt Markdown files were found.' });
  }
  issues.push(...defaultModelIssues(prompts, new Set(presets.map((preset) => preset.id))));

  prompts.sort(comparePromptsForLibrary);
  return { prompts, presets, issues };
}

function normalizeSources(input: Record<string, string> | PromptSourceInput | PromptSourceInput[]): PromptSourceInput[] {
  if (Array.isArray(input)) return input;
  if (isPromptSourceInput(input)) return [input];
  return [{ source: 'builtin', sourceLabel: sourceLabels.builtin, files: input }];
}

function isPromptSourceInput(input: Record<string, string> | PromptSourceInput): input is PromptSourceInput {
  const candidate = input as PromptSourceInput;
  return typeof candidate.source === 'string' && typeof candidate.files === 'object' && candidate.files !== null;
}

function qualifiedKey(source: PromptSourceInput, path: string): string {
  if (source.source === 'builtin') return path;
  if (source.source === 'folder') return `folder:${source.instanceId ?? 'workspace'}:${path}`;
  return `${source.source}:${path}`;
}

function dedupeWithinSource(prompts: Prompt[]): Prompt[] {
  const seen = new Set<string>();
  const winners: Prompt[] = [];
  for (const prompt of [...prompts].sort((a, b) => a.key.localeCompare(b.key))) {
    const dedupeKey = `${prompt.source}\u0000${prompt.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    winners.push(prompt);
  }
  return winners;
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
