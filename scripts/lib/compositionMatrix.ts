import {
  initialVariableValues,
  type OptionValues,
  type VariableValues
} from '../../src/data/composer';
import {
  evaluatePromptApplicability,
  type ParsedPrompt,
  type PromptVariable
} from '../../src/data/schemas';

export type EffectiveCompositionState = {
  values: VariableValues;
  optionValues: OptionValues;
};

export function effectiveMatrixCardinality(prompt: ParsedPrompt): number {
  return effectiveVariableCombinations(prompt).reduce((count, values) => {
    const applicability = evaluatePromptApplicability(prompt, values);
    const optionCount = prompt.options.filter((option) => {
      const state = applicability.options[option.id];
      return state?.visible && state.enabled;
    }).length;
    return count + (2 ** optionCount);
  }, 0);
}

export function effectiveCompositionStates(prompt: ParsedPrompt): EffectiveCompositionState[] {
  return effectiveVariableCombinations(prompt).flatMap((values) =>
    effectiveOptionCombinations(prompt, values).map((optionValues) => ({ values, optionValues }))
  );
}

function effectiveVariableCombinations(prompt: ParsedPrompt): VariableValues[] {
  let states: VariableValues[] = [initialVariableValues(prompt.variables)];

  for (const variable of variablesInApplicabilityOrder(prompt.variables)) {
    states = states.flatMap((state) => {
      const applicability = evaluatePromptApplicability(prompt, state).variables[variable.name];
      if (!applicability?.visible || !applicability.enabled) return [state];
      return matrixValues(variable).map((value) => ({ ...state, [variable.name]: value }));
    });
  }

  return states;
}

function effectiveOptionCombinations(prompt: ParsedPrompt, values: VariableValues): OptionValues[] {
  const applicability = evaluatePromptApplicability(prompt, values);
  const disabledOptions = Object.fromEntries(prompt.options.map((option) => [option.id, false]));
  let states: OptionValues[] = [disabledOptions];

  for (const option of prompt.options) {
    const optionState = applicability.options[option.id];
    if (!optionState?.visible || !optionState.enabled) continue;
    states = states.flatMap((state) => [
      { ...state, [option.id]: false },
      { ...state, [option.id]: true }
    ]);
  }

  return states;
}

function variablesInApplicabilityOrder(variables: PromptVariable[]): PromptVariable[] {
  const variablesByName = new Map(variables.map((variable) => [variable.name, variable]));
  const visited = new Set<string>();
  const ordered: PromptVariable[] = [];

  const visit = (variable: PromptVariable) => {
    if (visited.has(variable.name)) return;
    visited.add(variable.name);
    const dependencies = [
      ...Object.keys(variable.visibleWhen ?? {}),
      ...Object.keys(variable.enabledWhen ?? {})
    ];
    for (const dependency of dependencies) {
      const referenced = variablesByName.get(dependency);
      if (referenced) visit(referenced);
    }
    ordered.push(variable);
  };

  for (const variable of variables) visit(variable);
  return ordered;
}

function matrixValues(variable: PromptVariable): string[] {
  if (variable.control === 'select' || variable.control === 'slider') {
    return (variable.choices ?? []).map((choice) => choice.id);
  }
  return [variable.defaultValue ?? `test-${variable.name}`];
}
