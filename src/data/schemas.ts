import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export type ValidationIssue = {
  scope?: 'global' | 'prompt' | 'preset';
  path?: string;
  paths?: string[];
  promptPaths?: string[];
  promptKey?: string;
  promptKeys?: string[];
  message: string;
};

export type PromptVariable = {
  name: string;
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
};

export type PromptOption = {
  id: string;
  label: string;
  description?: string;
  defaultEnabled: boolean;
};

export type PromptSource = 'builtin' | 'global' | 'folder';

export type ParsedPrompt = {
  id: string;
  title: string;
  description?: string;
  category: string;
  kind: 'prompt' | 'command';
  tags: string[];
  variables: PromptVariable[];
  options: PromptOption[];
  defaultModelId?: string;
  template: string;
  path: string;
};

export type Prompt = ParsedPrompt & {
  source: PromptSource;
  sourceLabel: string;
  key: string;
};

export type PromptIdentity = {
  id: string;
  path: string;
  source?: PromptSource;
  key?: string;
};

export type ModelPreset = {
  id: string;
  label: string;
  description?: string;
};

const nonEmpty = z.string().trim().min(1);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const variableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const builtInPlaceholders = new Set(['model', 'rubberDuckModel']);
const reservedOptionIds = new Set([...builtInPlaceholders, 'allOptionsDisabled']);

const frontmatterSchema = z.object({
  id: nonEmpty,
  title: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  kind: z.enum(['prompt', 'command']).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  variables: z.unknown().optional(),
  options: z.unknown().optional(),
  model_default: z.string().optional(),
  defaultModel: z.string().optional(),
  modelDefault: z.string().optional(),
  modelPreset: z.string().optional(),
  modelPresetId: z.string().optional()
}).passthrough();

const modelPresetSchema = z.object({
  id: nonEmpty,
  label: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional()
}).passthrough();

const modelPresetDocumentSchema = z.union([
  z.array(modelPresetSchema),
  z.object({ presets: z.array(modelPresetSchema) }).passthrough()
]);

const variableObjectSchema = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional()
}).passthrough();

const optionObjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  default: z.boolean().optional(),
  defaultEnabled: z.boolean().optional()
}).passthrough();

/** Normalize CRLF and lone CR line endings to LF so whitespace handling is platform independent. */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Remove the indentation and trailing newline of a conditional block tag that sits alone on its
 * line, the way Handlebars and Mustache treat "standalone" tags. This keeps the tag itself for the
 * content pass while making sure a stacked block does not inject a blank line between its neighbours,
 * so the author's own blank lines are the only ones that survive.
 */
function stripStandaloneBlockTagLines(template: string): string {
  return template.replace(
    /^[ \t]*(\{\{[ \t]*(?:#option[ \t]+[A-Za-z_][A-Za-z0-9_]*|\/option|#allOptionsDisabled|\/allOptionsDisabled)[ \t]*\}\})[ \t]*(?:\n|$)/gm,
    '$1'
  );
}

export function parsePromptFile(path: string, raw: string): { prompt?: ParsedPrompt; promptIdentity?: PromptIdentity; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const match = normalizeLineEndings(raw).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);

  if (!match) {
    return { issues: [promptIssue(path, 'Missing YAML frontmatter.')] };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]) ?? {};
  } catch (error) {
    return { issues: [promptIssue(path, `Invalid YAML frontmatter: ${formatError(error)}`)] };
  }

  const frontmatter = frontmatterSchema.safeParse(parsed);
  if (!frontmatter.success) {
    return { issues: zodIssues(path, frontmatter.error, 'prompt') };
  }

  const id = frontmatter.data.id.trim();
  const promptIdentity = { id, path };
  if (!slugPattern.test(id)) {
    issues.push(promptIssue(path, 'Prompt id must be kebab-case using lowercase letters, numbers, and hyphens.'));
  }

  const template = match[2].trim();
  if (!template) {
    issues.push(promptIssue(path, 'Prompt template is empty.'));
  }

  const title = frontmatter.data.title?.trim() || frontmatter.data.name?.trim();
  if (!title) {
    issues.push(promptIssue(path, 'Prompt title or name is required.'));
  }
  if (!frontmatter.data.description?.trim()) {
    issues.push(promptIssue(path, 'Prompt description is required.'));
  }
  if (!frontmatter.data.category?.trim()) {
    issues.push(promptIssue(path, 'Prompt category is required.'));
  }

  const variables = normalizeVariables(path, frontmatter.data.variables, issues);
  const options = normalizeOptions(path, frontmatter.data.options, issues);
  const declaredNames = new Set(variables.map((variable) => variable.name));
  const declaredOptionIds = new Set(options.map((option) => option.id));
  issues.push(...validateTemplatePlaceholders(path, template, declaredNames, declaredOptionIds, options.length));

  if (issues.length > 0) {
    return { promptIdentity, issues };
  }

  return {
    issues,
    promptIdentity,
    prompt: {
      id,
      title: title!,
      description: frontmatter.data.description!.trim(),
      category: frontmatter.data.category!.trim(),
      kind: frontmatter.data.kind ?? 'prompt',
      tags: normalizeTags(frontmatter.data.tags),
      variables,
      options,
      defaultModelId: frontmatter.data.model_default ?? frontmatter.data.defaultModel ?? frontmatter.data.modelDefault ?? frontmatter.data.modelPreset ?? frontmatter.data.modelPresetId,
      template,
      path
    }
  };
}

export function parseModelPresets(path: string, raw: string): { presets: ModelPreset[]; issues: ValidationIssue[] } {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw) ?? {};
  } catch (error) {
    return { presets: [], issues: [presetIssue(path, `Invalid YAML: ${formatError(error)}`)] };
  }

  const result = modelPresetDocumentSchema.safeParse(parsed);
  if (!result.success) {
    return { presets: [], issues: zodIssues(path, result.error, 'preset') };
  }

  const source = Array.isArray(result.data) ? result.data : result.data.presets;
  const seen = new Map<string, number>();
  const issues: ValidationIssue[] = [];
  const presets = source.map((preset, index) => {
    const id = preset.id.trim();
    if (!slugPattern.test(id)) {
      issues.push(presetIssue(path, `Model preset id "${id}" must be kebab-case using lowercase letters, numbers, and hyphens.`));
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
    return {
      id,
      label: preset.label?.trim() || preset.name?.trim() || id,
      description: preset.description
    } satisfies ModelPreset;
  });

  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push(presetIssue(path, `Duplicate model preset id "${id}".`));
    }
  }

  return { presets: issues.length > 0 ? [] : presets, issues };
}

export function defaultModelIssues(prompts: ParsedPrompt[], presetIds: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const prompt of prompts) {
    if (prompt.defaultModelId && !presetIds.has(prompt.defaultModelId)) {
      issues.push(promptIssue(prompt.path, `Default model preset "${prompt.defaultModelId}" does not exist.`, promptKeyExtra(prompt)));
    }
  }
  return issues;
}

export function validatePromptCollection(
  prompts: ParsedPrompt[],
  presets: ModelPreset[],
  options: { promptFileCount?: number; promptIdentities?: PromptIdentity[] } = {}
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const presetIds = new Set(presets.map((preset) => preset.id));
  const promptFileCount = options.promptFileCount ?? prompts.length;
  const promptIdentities = options.promptIdentities
    ?? prompts.map((prompt) => ({ id: prompt.id, path: prompt.path, source: (prompt as Partial<Prompt>).source, key: (prompt as Partial<Prompt>).key }));

  if (promptFileCount === 0) {
    issues.push({ scope: 'global', message: 'No prompt Markdown files were found.' });
  }

  issues.push(...defaultModelIssues(prompts, presetIds));
  issues.push(...duplicatePromptIdIssues(promptIdentities));

  return issues;
}

function duplicatePromptIdIssues(identities: PromptIdentity[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const groups = new Map<string, PromptIdentity[]>();
  for (const identity of identities) {
    const groupKey = `${identity.source ?? 'builtin'}\u0000${identity.id}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), identity]);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const id = group[0].id;
    const paths = group.map((identity) => identity.path);
    const keys = group.map((identity) => identity.key ?? identity.path);
    for (const identity of group) {
      issues.push(promptIssue(identity.path, `Duplicate prompt id "${id}".`, {
        paths,
        promptPaths: paths,
        promptKeys: keys,
        ...(identity.key ? { promptKey: identity.key } : {})
      }));
    }
  }

  return issues;
}

function promptKeyExtra(prompt: ParsedPrompt): Partial<ValidationIssue> {
  const key = (prompt as Partial<Prompt>).key;
  return key ? { promptKey: key } : {};
}

export function extractPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const span of extractTemplateSpans(template)) {
    if (span.kind === 'placeholder') {
      names.add(span.name);
    }
  }
  return [...names];
}

export function renderPromptTemplateOptions(template: string, optionValues: Record<string, boolean>, allOptionsDisabled: boolean): string {
  return stripStandaloneBlockTagLines(normalizeLineEndings(template))
    .replace(/\{\{\s*#option\s+([A-Za-z_][A-Za-z0-9_]*)\s*\}\}([\s\S]*?)\{\{\s*\/option\s*\}\}/g, (_, optionId: string, content: string) =>
      optionValues[optionId] ? content : ''
    )
    .replace(/\{\{\s*#allOptionsDisabled\s*\}\}([\s\S]*?)\{\{\s*\/allOptionsDisabled\s*\}\}/g, (_, content: string) =>
      allOptionsDisabled ? content : ''
    )
    // Reduce lines that hold only spaces or tabs to true blank lines so a stray whitespace line cannot survive.
    .replace(/^[ \t]+$/gm, '')
    // Collapse a run of blank lines to a single blank line.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validateTemplatePlaceholders(path: string, template: string, declaredNames: Set<string>, declaredOptionIds: Set<string>, optionCount: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const unknownPlaceholders = new Set<string>();
  const usedOptionIds = new Set<string>();
  let hasAllOptionsDisabledBlock = false;
  const blockStack: { kind: 'option' | 'allOptionsDisabled'; raw: string; optionId?: string }[] = [];

  for (const span of extractTemplateSpans(template)) {
    if (span.kind === 'invalid') {
      issues.push(promptIssue(path, span.message));
      continue;
    }

    if (span.kind === 'placeholder') {
      if (!declaredNames.has(span.name) && !builtInPlaceholders.has(span.name) && !unknownPlaceholders.has(span.name)) {
        unknownPlaceholders.add(span.name);
        issues.push(promptIssue(path, `Unknown placeholder "${span.name}" is not declared as a variable.`));
      }
      continue;
    }

    if (span.kind === 'optionOpen') {
      usedOptionIds.add(span.optionId);
      if (blockStack.length > 0) {
        issues.push(promptIssue(path, 'Nested option blocks are not supported.'));
      }
      if (!declaredOptionIds.has(span.optionId)) {
        issues.push(promptIssue(path, `Unknown option block "${span.optionId}" is not declared in options.`));
      }
      blockStack.push({ kind: 'option', raw: span.raw, optionId: span.optionId });
      continue;
    }

    if (span.kind === 'allOptionsDisabledOpen') {
      hasAllOptionsDisabledBlock = true;
      if (optionCount === 0) {
        issues.push(promptIssue(path, 'The {{#allOptionsDisabled}} block requires at least one declared option.'));
      }
      if (blockStack.length > 0) {
        issues.push(promptIssue(path, 'Nested option blocks are not supported.'));
      }
      blockStack.push({ kind: 'allOptionsDisabled', raw: span.raw });
      continue;
    }

    if (span.kind === 'optionClose') {
      if (blockStack.length === 0) {
        issues.push(promptIssue(path, 'Stray closing option block "{{/option}}".'));
        continue;
      }
      const openBlock = blockStack.pop()!;
      if (openBlock.kind !== 'option') {
        issues.push(promptIssue(path, `Mismatched closing tag "{{/option}}" for "${openBlock.raw}".`));
      }
      continue;
    }

    if (span.kind === 'allOptionsDisabledClose') {
      if (blockStack.length === 0) {
        issues.push(promptIssue(path, 'Stray closing all-options-disabled block "{{/allOptionsDisabled}}".'));
        continue;
      }
      const openBlock = blockStack.pop()!;
      if (openBlock.kind !== 'allOptionsDisabled') {
        issues.push(promptIssue(path, `Mismatched closing tag "{{/allOptionsDisabled}}" for "${openBlock.raw}".`));
      }
    }
  }

  for (const openBlock of blockStack) {
    if (openBlock.kind === 'option') {
      issues.push(promptIssue(path, `Unclosed option block "${openBlock.raw}".`));
    } else {
      issues.push(promptIssue(path, `Unclosed all-options-disabled block "${openBlock.raw}".`));
    }
  }
  for (const optionId of declaredOptionIds) {
    if (!usedOptionIds.has(optionId)) {
      issues.push(promptIssue(path, `Option "${optionId}" is declared but is not used in an option block.`));
    }
  }
  if (optionCount > 0 && !hasAllOptionsDisabledBlock) {
    issues.push(promptIssue(path, 'Prompts with options must include a {{#allOptionsDisabled}} fallback block.'));
  }
  for (const match of template.matchAll(/\{\{\s*#allOptionsDisabled\s*\}\}([\s\S]*?)\{\{\s*\/allOptionsDisabled\s*\}\}/g)) {
    if (!match[1].trim()) {
      issues.push(promptIssue(path, 'The {{#allOptionsDisabled}} fallback block must not be empty.'));
    }
  }
  return issues;
}

type TemplateSpan =
  | { kind: 'placeholder'; name: string }
  | { kind: 'optionOpen'; optionId: string; raw: string }
  | { kind: 'optionClose'; raw: string }
  | { kind: 'allOptionsDisabledOpen'; raw: string }
  | { kind: 'allOptionsDisabledClose'; raw: string }
  | { kind: 'invalid'; message: string };

function extractTemplateSpans(template: string): TemplateSpan[] {
  const spans: TemplateSpan[] = [];
  let index = 0;

  while (index < template.length) {
    if (template.startsWith('{{', index)) {
      const closeIndex = template.indexOf('}}', index + 2);
      if (closeIndex === -1) {
        spans.push({ kind: 'invalid', message: `Unclosed placeholder "${template.slice(index)}".` });
        break;
      }

      const hasExtraClosingBrace = template[closeIndex + 2] === '}';
      const raw = template.slice(index, closeIndex + (hasExtraClosingBrace ? 3 : 2));
      const content = template.slice(index + 2, closeIndex).trim();
      const optionMatch = content.match(/^#option\s+([A-Za-z_][A-Za-z0-9_]*)$/);

      if (hasExtraClosingBrace) {
        spans.push({ kind: 'invalid', message: `Invalid placeholder syntax "${raw}". Use {{variableName}} with letters, numbers, or underscores only.` });
      } else if (optionMatch) {
        spans.push({ kind: 'optionOpen', optionId: optionMatch[1], raw });
      } else if (content === '/option') {
        spans.push({ kind: 'optionClose', raw });
      } else if (content === '#allOptionsDisabled') {
        spans.push({ kind: 'allOptionsDisabledOpen', raw });
      } else if (content === '/allOptionsDisabled') {
        spans.push({ kind: 'allOptionsDisabledClose', raw });
      } else if (content.startsWith('#option') || content.startsWith('/option')) {
        spans.push({ kind: 'invalid', message: `Invalid option block syntax "${raw}". Use {{#option optionId}} and {{/option}}.` });
      } else if (content.startsWith('#allOptionsDisabled') || content.startsWith('/allOptionsDisabled')) {
        spans.push({ kind: 'invalid', message: `Invalid all-options-disabled block syntax "${raw}". Use {{#allOptionsDisabled}} and {{/allOptionsDisabled}}.` });
      } else if (variableNamePattern.test(content)) {
        spans.push({ kind: 'placeholder', name: content });
      } else {
        spans.push({ kind: 'invalid', message: `Invalid placeholder syntax "${raw}". Use {{variableName}} with letters, numbers, or underscores only.` });
      }

      index = closeIndex + (hasExtraClosingBrace ? 3 : 2);
      continue;
    }

    if (template.startsWith('}}', index)) {
      spans.push({ kind: 'invalid', message: 'Unbalanced closing braces "}}".' });
      index += 2;
      continue;
    }

    index += 1;
  }

  return spans;
}

function normalizeVariables(path: string, input: unknown, issues: ValidationIssue[]): PromptVariable[] {
  if (input == null) {
    return [];
  }

  const variables: PromptVariable[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        const name = item.trim();
        if (name) pushVariable(path, issues, variables, { name, label: name, required: true });
        continue;
      }

      const parsed = variableObjectSchema.safeParse(item);
      if (!parsed.success) {
        issues.push(...zodIssues(path, parsed.error, 'prompt'));
        continue;
      }
      const name = parsed.data.name?.trim() || parsed.data.id?.trim();
      if (!name) {
        issues.push(promptIssue(path, 'Variable is missing name or id.'));
        continue;
      }
      pushVariable(path, issues, variables, {
        name,
        label: parsed.data.label?.trim() || name,
        description: parsed.data.description,
        required: parsed.data.required ?? true,
        defaultValue: stringifyDefault(parsed.data.defaultValue ?? parsed.data.default)
      });
    }
  } else if (typeof input === 'object') {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        pushVariable(path, issues, variables, { name: key, label: key, required: true, defaultValue: stringifyDefault(value) });
        continue;
      }
      const parsed = variableObjectSchema.safeParse(value);
      if (!parsed.success) {
        issues.push(...zodIssues(path, parsed.error, 'prompt'));
        continue;
      }
      pushVariable(path, issues, variables, {
        name: key,
        label: parsed.data.label?.trim() || key,
        description: parsed.data.description,
        required: parsed.data.required ?? true,
        defaultValue: stringifyDefault(parsed.data.defaultValue ?? parsed.data.default)
      });
    }
  } else {
    issues.push(promptIssue(path, 'Variables must be an array or object.'));
  }

  const counts = new Map<string, number>();
  for (const variable of variables) {
    counts.set(variable.name, (counts.get(variable.name) ?? 0) + 1);
  }
  for (const [name, count] of counts) {
    if (count > 1) {
      issues.push(promptIssue(path, `Duplicate variable name "${name}".`));
    }
  }

  return variables;
}

function normalizeOptions(path: string, input: unknown, issues: ValidationIssue[]): PromptOption[] {
  if (input == null) {
    return [];
  }

  const options: PromptOption[] = [];
  if (!Array.isArray(input)) {
    issues.push(promptIssue(path, 'Options must be an array.'));
    return options;
  }

  for (const item of input) {
    if (typeof item === 'string') {
      const id = item.trim();
      if (id) pushOption(path, issues, options, { id, label: id, defaultEnabled: true });
      continue;
    }

    const parsed = optionObjectSchema.safeParse(item);
    if (!parsed.success) {
      issues.push(...zodIssues(path, parsed.error, 'prompt'));
      continue;
    }
    const id = parsed.data.id?.trim() || parsed.data.name?.trim();
    if (!id) {
      issues.push(promptIssue(path, 'Option is missing id or name.'));
      continue;
    }
    pushOption(path, issues, options, {
      id,
      label: parsed.data.label?.trim() || id,
      description: parsed.data.description?.trim() || undefined,
      defaultEnabled: parsed.data.defaultEnabled ?? parsed.data.default ?? true
    });
  }

  const counts = new Map<string, number>();
  for (const option of options) {
    counts.set(option.id, (counts.get(option.id) ?? 0) + 1);
  }
  for (const [id, count] of counts) {
    if (count > 1) {
      issues.push(promptIssue(path, `Duplicate option id "${id}".`));
    }
  }

  return options;
}

function pushOption(path: string, issues: ValidationIssue[], options: PromptOption[], option: PromptOption) {
  if (!variableNamePattern.test(option.id)) {
    issues.push(promptIssue(path, `Option id "${option.id}" must start with a letter or underscore and contain only letters, numbers, and underscores.`));
    return;
  }

  if (reservedOptionIds.has(option.id)) {
    issues.push(promptIssue(path, `Option id "${option.id}" is reserved for a built-in placeholder or block.`));
    return;
  }

  options.push(option);
}

function pushVariable(path: string, issues: ValidationIssue[], variables: PromptVariable[], variable: PromptVariable) {
  if (!variableNamePattern.test(variable.name)) {
    issues.push(promptIssue(path, `Variable name "${variable.name}" must start with a letter or underscore and contain only letters, numbers, and underscores.`));
    return;
  }

  if (builtInPlaceholders.has(variable.name)) {
    issues.push(promptIssue(path, `Variable name "${variable.name}" is reserved for a built-in placeholder.`));
    return;
  }

  variables.push(variable);
}

function normalizeTags(input: string[] | string | undefined): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((tag) => tag.trim()).filter(Boolean);
  return input.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function stringifyDefault(value: unknown): string | undefined {
  if (value == null) return undefined;
  return String(value);
}

function zodIssues(path: string, error: z.ZodError, scope: 'prompt' | 'preset'): ValidationIssue[] {
  return error.issues.map((issue) => ({ scope, path, message: `${issue.path.join('.') || 'document'}: ${issue.message}` }));
}

function promptIssue(path: string, message: string, extra: Partial<ValidationIssue> = {}): ValidationIssue {
  return { scope: 'prompt', path, message, ...extra };
}

function presetIssue(path: string, message: string): ValidationIssue {
  return { scope: 'preset', path, message };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
