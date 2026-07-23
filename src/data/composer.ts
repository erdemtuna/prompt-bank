import { extractPlaceholders, renderPromptTemplateOptions, type Prompt, type PromptOption, type PromptVariable, type ValidationIssue } from './schemas';

export type VariableValues = Record<string, string>;
export type OptionValues = Record<string, boolean>;
export type BuiltInValues = Record<string, string | undefined>;
const modelBuiltIns = ['model', 'rubberDuckModel'] as const;

export type CompositionResult = {
  text: string;
  activeVariableNames: string[];
  missingRequired: string[];
  missingBuiltIns: string[];
  validationBlockers: string[];
  disabledReasons: string[];
  usesModelPlaceholder: boolean;
  usesRubberDuckModelPlaceholder: boolean;
  isValid: boolean;
  canCopy: boolean;
};

export type CompositionOptions = {
  validationIssues?: ValidationIssue[];
  optionValues?: OptionValues;
};

export function initialVariableValues(variables: PromptVariable[]): VariableValues {
  return Object.fromEntries(variables.map((variable) => [variable.name, variable.defaultValue ?? '']));
}

export function initialOptionValues(options: PromptOption[]): OptionValues {
  return Object.fromEntries(options.map((option) => [option.id, option.defaultEnabled]));
}

export function promptUsesModelPlaceholder(prompt: Prompt): boolean {
  return extractPlaceholders(renderPromptTemplate(prompt, initialOptionValues(prompt.options))).includes('model');
}

export function promptUsesRubberDuckModelPlaceholder(prompt: Prompt): boolean {
  return extractPlaceholders(renderPromptTemplate(prompt, initialOptionValues(prompt.options))).includes('rubberDuckModel');
}

export function composePrompt(prompt: Prompt, values: VariableValues, builtIns: BuiltInValues = {}, options: CompositionOptions = {}): CompositionResult {
  const optionValues = { ...initialOptionValues(prompt.options), ...(options.optionValues ?? {}) };
  const renderedTemplate = renderPromptTemplate(prompt, optionValues);
  const placeholders = extractPlaceholders(renderedTemplate);
  const usesModelPlaceholder = placeholders.includes('model');
  const usesRubberDuckModelPlaceholder = placeholders.includes('rubberDuckModel');
  const usesAnyModelPlaceholder = usesModelPlaceholder || usesRubberDuckModelPlaceholder;
  const activeVariableNames = prompt.options.length === 0
    ? prompt.variables.map((variable) => variable.name)
    : prompt.variables.filter((variable) => placeholders.includes(variable.name)).map((variable) => variable.name);
  const missingRequired = prompt.variables
    .filter((variable) => activeVariableNames.includes(variable.name) && variable.required && !(values[variable.name] ?? variable.defaultValue ?? '').trim())
    .map((variable) => variable.name);
  const missingBuiltIns = modelBuiltIns.filter((name) => placeholders.includes(name) && !builtIns[name]?.trim());
  const validationBlockers = validationBlockersForPrompt(prompt, options.validationIssues ?? [], usesAnyModelPlaceholder);

  const text = renderedTemplate.replace(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g, (_, name: string) => {
    if (isModelBuiltIn(name) && !builtIns[name]?.trim()) {
      return `{{${name}}}`;
    }
    return values[name] ?? builtIns[name] ?? prompt.variables.find((variable) => variable.name === name)?.defaultValue ?? '';
  });
  const disabledReasons = [
    ...missingRequired.map((name) => `Missing required variable "${name}".`),
    ...missingBuiltIns.map((name) => `Select a valid ${modelBuiltInLabel(name)} for the built-in {{${name}}} placeholder.`),
    ...validationBlockers
  ];

  return {
    text,
    activeVariableNames,
    missingRequired,
    missingBuiltIns,
    validationBlockers,
    disabledReasons,
    usesModelPlaceholder,
    usesRubberDuckModelPlaceholder,
    isValid: disabledReasons.length === 0,
    canCopy: disabledReasons.length === 0
  };
}

function renderPromptTemplate(prompt: Prompt, optionValues: OptionValues): string {
  const allOptionsDisabled = prompt.options.length > 0 && prompt.options.every((option) => optionValues[option.id] === false);
  return renderPromptTemplateOptions(prompt.template, optionValues, allOptionsDisabled);
}

function validationBlockersForPrompt(prompt: Prompt, issues: ValidationIssue[], usesAnyModelPlaceholder: boolean): string[] {
  return issues
    .filter((issue) => {
      if (issue.scope === 'global') return true;
      if (issue.scope === 'preset') return usesAnyModelPlaceholder;
      if (!usesAnyModelPlaceholder && isDefaultModelIssue(issue)) return false;
      return issueAppliesToPrompt(issue, prompt);
    })
    .map((issue) => `${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
}

function isModelBuiltIn(name: string): name is typeof modelBuiltIns[number] {
  return modelBuiltIns.includes(name as typeof modelBuiltIns[number]);
}

function modelBuiltInLabel(name: typeof modelBuiltIns[number]): string {
  return name === 'rubberDuckModel' ? 'alternative model preset' : 'general model preset';
}

function issueAppliesToPrompt(issue: ValidationIssue, prompt: Prompt): boolean {
  if (issue.promptKey !== undefined || issue.promptKeys !== undefined) {
    return issue.promptKey === prompt.key || issue.promptKeys?.includes(prompt.key) === true;
  }
  return issue.path === prompt.path || issue.paths?.includes(prompt.path) === true || issue.promptPaths?.includes(prompt.path) === true;
}

function isDefaultModelIssue(issue: ValidationIssue): boolean {
  return /^Default model preset ".+" does not exist\.$/.test(issue.message);
}
