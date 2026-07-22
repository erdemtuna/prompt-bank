import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModelPresets, parsePromptFile, validatePromptCollection, type Prompt, type PromptIdentity, type ValidationIssue } from '../src/data/schemas';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const promptRoot = join(repoRoot, 'prompts');
const modelPresetPath = join(repoRoot, 'model-presets.yaml');
const issues: ValidationIssue[] = [];
const prompts: Prompt[] = [];
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

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  }
  process.exit(1);
}

console.log(`Validated ${prompts.length} prompt file(s) and ${presetResult.presets.length} model preset(s).`);

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
