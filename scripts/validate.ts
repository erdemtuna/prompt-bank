import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeModelLabel, composePrompt, type OptionValues, type VariableValues } from '../src/data/composer';
import { parseModelPresets, parsePromptFile, validatePromptCollection, type ParsedPrompt, type Prompt, type PromptIdentity, type ValidationIssue } from '../src/data/schemas';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const requestedPromptRoot = argumentValue(args, '--prompt-root');
const promptRoot = requestedPromptRoot
  ? (isAbsolute(requestedPromptRoot) ? requestedPromptRoot : resolve(repoRoot, requestedPromptRoot))
  : join(repoRoot, 'prompts');
const runMatrix = args.includes('--matrix');
const modelPresetPath = join(repoRoot, 'model-presets.yaml');
const packageVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
const issues: ValidationIssue[] = [];
const prompts: ParsedPrompt[] = [];
const promptIdentities: PromptIdentity[] = [];

const presetResult = parseModelPresets(relative(repoRoot, modelPresetPath), readFileSync(modelPresetPath, 'utf8'));
issues.push(...presetResult.issues);

const promptFiles = markdownFiles(promptRoot);
for (const filePath of promptFiles) {
  const displayPath = relative(repoRoot, filePath);
  const result = parsePromptFile(displayPath, readFileSync(filePath, 'utf8'));
  issues.push(...result.issues);
  if (result.promptIdentity) promptIdentities.push(result.promptIdentity);
  if (result.prompt) prompts.push(result.prompt);
}

issues.push(...validatePromptCollection(prompts, presetResult.presets, { promptFileCount: promptFiles.length, promptIdentities }));

if (issues.length === 0 && runMatrix) {
  issues.push(...validateCompositionMatrix(prompts, presetResult.presets));
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${prompts.length} prompt file(s) and ${presetResult.presets.length} model preset(s)`
  + `${runMatrix ? ' across all control combinations' : ''} with Prompt Bank ${packageVersion.version}.`
);

function markdownFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root).map((entry) => join(root, entry));
  const files: string[] = [];
  for (const entry of entries) {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      files.push(...markdownFiles(entry));
    } else if (entry.endsWith('.md')) {
      files.push(entry);
    }
  }
  return files.sort();
}

function validateCompositionMatrix(prompts: ParsedPrompt[], presets: ReturnType<typeof parseModelPresets>['presets']): ValidationIssue[] {
  const matrixIssues: ValidationIssue[] = [];
  const preset = presets[0];
  const modelLabel = composeModelLabel(preset, preset?.defaultContextId ?? '', preset?.defaultReasoningId ?? '');

  for (const parsedPrompt of prompts) {
    const prompt: Prompt = {
      ...parsedPrompt,
      source: 'folder',
      sourceLabel: 'Folder',
      key: `matrix:${parsedPrompt.path}`
    };
    const combinationCount = matrixCardinality(prompt);
    if (combinationCount > 4096) {
      matrixIssues.push({
        scope: 'prompt',
        path: prompt.path,
        message: `Composition matrix has ${combinationCount} combinations, exceeding the 4096 safety limit.`
      });
      continue;
    }
    const variableStates = variableCombinations(prompt);
    const optionStates = optionCombinations(prompt);

    for (const values of variableStates) {
      for (const optionValues of optionStates) {
        const result = composePrompt(
          prompt,
          values,
          { model: modelLabel, rubberDuckModel: modelLabel },
          { optionValues }
        );
        const state = stateLabel(values, optionValues);
        if (!result.canCopy) {
          matrixIssues.push({
            scope: 'prompt',
            path: prompt.path,
            message: `Composition failed for ${state}: ${result.disabledReasons.join(' ')}`
          });
          continue;
        }
        if (/\{\{\s*[#/](?:option|allOptionsDisabled|when)\b/.test(result.text)) {
          matrixIssues.push({
            scope: 'prompt',
            path: prompt.path,
            message: `Composition left an unresolved control tag for ${state}.`
          });
        }
      }
    }
  }

  return matrixIssues;
}

function matrixCardinality(prompt: ParsedPrompt): number {
  const variableCount = prompt.variables.reduce((count, variable) => {
    const values = variable.control === 'select' || variable.control === 'slider'
      ? variable.choices?.length ?? 0
      : 1;
    return count * values;
  }, 1);
  return variableCount * (2 ** prompt.options.length);
}

function variableCombinations(prompt: ParsedPrompt): VariableValues[] {
  let states: VariableValues[] = [{}];
  for (const variable of prompt.variables) {
    const values = variable.control === 'select' || variable.control === 'slider'
      ? (variable.choices ?? []).map((choice) => choice.id)
      : [variable.defaultValue ?? `test-${variable.name}`];
    states = states.flatMap((state) => values.map((value) => ({ ...state, [variable.name]: value })));
  }
  return states;
}

function optionCombinations(prompt: ParsedPrompt): OptionValues[] {
  let states: OptionValues[] = [{}];
  for (const option of prompt.options) {
    states = states.flatMap((state) => [
      { ...state, [option.id]: false },
      { ...state, [option.id]: true }
    ]);
  }
  return states;
}

function stateLabel(values: VariableValues, optionValues: OptionValues): string {
  const typedValues = Object.entries(values)
    .filter(([, value]) => !value.startsWith('test-'))
    .map(([name, value]) => `${name}=${value}`);
  const options = Object.entries(optionValues).map(([name, enabled]) => `${name}=${enabled}`);
  return [...typedValues, ...options].join(', ') || 'the default state';
}

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires a path.`);
    process.exit(1);
  }
  return value;
}
