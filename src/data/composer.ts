import {
  evaluatePromptApplicability,
  extractApplicabilityVariableNames,
  extractConditionVariableNames,
  extractPlaceholders,
  modelRoleRequirements,
  renderPromptTemplateModels,
  renderPromptTemplateControls,
  type ModelPreset,
  type ModelRoleRequirements,
  type Prompt,
  type PromptApplicability,
  type PromptOption,
  type PromptVariable,
  type ValidationIssue
} from './schemas';

export type VariableValues = Record<string, string>;
export type OptionValues = Record<string, boolean>;
export type BuiltInValues = Record<string, string | undefined>;
const modelBuiltIns = ['model', 'rubberDuckModel'] as const;

export function composeModelLabel(preset: ModelPreset | undefined, contextId: string, reasoningId: string): string | undefined {
  if (!preset) return undefined;
  const context = preset.contexts.find((variant) => variant.id === contextId);
  const reasoning = preset.reasoning.find((variant) => variant.id === reasoningId);
  return [preset.label, context?.label, reasoning?.label]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export type CompositionResult = {
  text: string;
  activeVariableNames: string[];
  missingRequired: string[];
  missingBuiltIns: string[];
  validationBlockers: string[];
  disabledReasons: string[];
  usesModelPlaceholder: boolean;
  usesRubberDuckModelPlaceholder: boolean;
  modelRoleRequirements: ModelRoleRequirements;
  applicability: PromptApplicability;
  effectiveOptionValues: OptionValues;
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

export type PromptControlState = {
  applicability: PromptApplicability;
  effectiveOptionValues: OptionValues;
  inactiveConditionVariableNames: Set<string>;
  allOptionsDisabled: boolean;
};

export function resolvePromptControlState(
  prompt: Pick<Prompt, 'variables' | 'options'>,
  values: VariableValues,
  optionValues: OptionValues
): PromptControlState {
  const variableValues = { ...initialVariableValues(prompt.variables), ...values };
  const applicability = evaluatePromptApplicability(prompt, variableValues);
  const effectiveOptionValues = Object.fromEntries(prompt.options.map((option) => {
    const state = applicability.options[option.id];
    return [option.id, Boolean(state?.visible && state.enabled && optionValues[option.id])];
  }));
  const visibleOptions = prompt.options.filter((option) => applicability.options[option.id]?.visible);
  return {
    applicability,
    effectiveOptionValues,
    inactiveConditionVariableNames: new Set(
      prompt.variables
        .filter((variable) => {
          const state = applicability.variables[variable.name];
          return !state?.visible
            || ((variable.control === 'select' || variable.control === 'slider') && !state.enabled);
        })
        .map((variable) => variable.name)
    ),
    allOptionsDisabled: visibleOptions.length > 0
      && visibleOptions.every((option) => effectiveOptionValues[option.id] === false)
  };
}

export function normalizeOptionValues(
  prompt: Pick<Prompt, 'variables' | 'options'>,
  values: VariableValues,
  optionValues: OptionValues
): OptionValues {
  return resolvePromptControlState(prompt, values, optionValues).effectiveOptionValues;
}

export function promptUsesModelPlaceholder(prompt: Prompt): boolean {
  return promptModelRoleRequirements(prompt).model !== 'inactive';
}

export function promptUsesRubberDuckModelPlaceholder(prompt: Prompt): boolean {
  return promptModelRoleRequirements(prompt).rubberDuckModel !== 'inactive';
}

export function promptModelRoleRequirements(prompt: Prompt): ModelRoleRequirements {
  return modelRoleRequirements(
    renderPromptWorkflowTemplate(prompt, initialOptionValues(prompt.options), initialVariableValues(prompt.variables))
  );
}

export function composePrompt(prompt: Prompt, values: VariableValues, builtIns: BuiltInValues = {}, options: CompositionOptions = {}): CompositionResult {
  const requestedOptionValues = { ...initialOptionValues(prompt.options), ...(options.optionValues ?? {}) };
  const variableValues = { ...initialVariableValues(prompt.variables), ...values };
  const controlState = resolvePromptControlState(prompt, variableValues, requestedOptionValues);
  const workflowTemplate = renderPromptWorkflowTemplate(prompt, controlState.effectiveOptionValues, variableValues, controlState);
  const roleRequirements = modelRoleRequirements(workflowTemplate);
  const renderedTemplate = renderPromptTemplateModels(workflowTemplate, builtIns);
  const placeholders = extractPlaceholders(renderedTemplate);
  const conditionVariableNames = extractConditionVariableNames(prompt.template);
  const applicabilityVariableNames = extractApplicabilityVariableNames(prompt);
  const usesModelPlaceholder = roleRequirements.model !== 'inactive';
  const usesRubberDuckModelPlaceholder = roleRequirements.rubberDuckModel !== 'inactive';
  const usesAnyModelPlaceholder = usesModelPlaceholder || usesRubberDuckModelPlaceholder;
  const hasConditionalBlocks = prompt.options.length > 0 || conditionVariableNames.length > 0 || applicabilityVariableNames.length > 0;
  const activeVariableNames = !hasConditionalBlocks
    ? prompt.variables
      .filter((variable) => isVariableActive(controlState.applicability, variable.name))
      .map((variable) => variable.name)
    : prompt.variables
      .filter((variable) =>
        isVariableActive(controlState.applicability, variable.name)
        && (
          placeholders.includes(variable.name)
          || conditionVariableNames.includes(variable.name)
          || applicabilityVariableNames.includes(variable.name)
        )
      )
      .map((variable) => variable.name);
  const missingRequired = prompt.variables
    .filter((variable) => activeVariableNames.includes(variable.name) && variable.required && !(variableValues[variable.name] ?? '').trim())
    .map((variable) => variable.name);
  const invalidSelections = prompt.variables
    .filter((variable) =>
      activeVariableNames.includes(variable.name)
      && (variable.control === 'select' || variable.control === 'slider')
      && !variable.choices?.some((choice) => choice.id === variableValues[variable.name])
    )
    .map((variable) => variable.name);
  const missingBuiltIns = modelBuiltIns.filter((name) => placeholders.includes(name) && !builtIns[name]?.trim());
  const usesSelectedOrRequiredModel = modelBuiltIns.some((name) =>
    roleRequirements[name] === 'required'
    || (roleRequirements[name] === 'optional' && Boolean(builtIns[name]?.trim()))
  );
  const requiresDefaultModel = modelBuiltIns.some((name) => roleRequirements[name] === 'required');
  const validationBlockers = validationBlockersForPrompt(
    prompt,
    options.validationIssues ?? [],
    usesAnyModelPlaceholder,
    usesSelectedOrRequiredModel,
    requiresDefaultModel
  );

  const text = renderedTemplate.replace(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g, (_, name: string) => {
    if (isModelBuiltIn(name) && !builtIns[name]?.trim()) {
      return `{{${name}}}`;
    }
    const variable = prompt.variables.find((candidate) => candidate.name === name);
    if (variable) {
      if (!isVariableActive(controlState.applicability, name)) return '';
      return interpolatedVariableValue(variable, variableValues[name] ?? '');
    }
    return builtIns[name] ?? '';
  });
  const disabledReasons = [
    ...missingRequired.map((name) => `Missing required variable "${name}".`),
    ...invalidSelections.map((name) => `Select a valid choice for variable "${name}".`),
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
    modelRoleRequirements: roleRequirements,
    applicability: controlState.applicability,
    effectiveOptionValues: controlState.effectiveOptionValues,
    isValid: disabledReasons.length === 0,
    canCopy: disabledReasons.length === 0
  };
}

function renderPromptWorkflowTemplate(
  prompt: Prompt,
  optionValues: OptionValues,
  variableValues: VariableValues,
  controlState = resolvePromptControlState(prompt, variableValues, optionValues)
): string {
  return renderPromptTemplateControls(
    prompt.template,
    controlState.effectiveOptionValues,
    controlState.allOptionsDisabled,
    variableValues,
    controlState.inactiveConditionVariableNames
  );
}

function isVariableActive(applicability: PromptApplicability, name: string): boolean {
  const state = applicability.variables[name];
  return Boolean(state?.visible && state.enabled);
}

function interpolatedVariableValue(variable: PromptVariable, rawValue: string): string {
  if (variable.control !== 'select' && variable.control !== 'slider') {
    return rawValue;
  }
  const choice = variable.choices?.find((candidate) => candidate.id === rawValue);
  return choice?.value ?? choice?.label ?? rawValue;
}

function validationBlockersForPrompt(
  prompt: Prompt,
  issues: ValidationIssue[],
  usesAnyModelPlaceholder: boolean,
  usesSelectedOrRequiredModel: boolean,
  requiresDefaultModel: boolean
): string[] {
  return issues
    .filter((issue) => {
      if (issue.scope === 'global') return true;
      if (issue.scope === 'preset') return usesSelectedOrRequiredModel;
      if (isDefaultModelIssue(issue) && !requiresDefaultModel) return false;
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
  const qualifiedKeys = [
    ...(typeof issue.promptKey === 'string' ? [issue.promptKey] : []),
    ...(Array.isArray(issue.promptKeys) ? issue.promptKeys : [])
  ].filter((key) => key.length > 0);
  if (qualifiedKeys.length > 0) {
    return qualifiedKeys.includes(prompt.key);
  }
  return issue.path === prompt.path || issue.paths?.includes(prompt.path) === true || issue.promptPaths?.includes(prompt.path) === true;
}

function isDefaultModelIssue(issue: ValidationIssue): boolean {
  return /^Default model preset ".+" does not exist\.$/.test(issue.message);
}
