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

export type EffectiveMatrixCardinality = {
  count: number;
  exceededLimit: boolean;
};

export function effectiveMatrixCardinality(
  prompt: ParsedPrompt,
  limit: number
): EffectiveMatrixCardinality {
  validateLimit(limit);
  let count = 0;

  for (const values of effectiveVariableCombinations(prompt)) {
    const applicability = evaluatePromptApplicability(prompt, values);
    const optionCount = prompt.options.filter((option) => {
      const state = applicability.options[option.id];
      return state?.visible && state.enabled;
    }).length;
    const stateCount = 2 ** optionCount;
    if (!Number.isSafeInteger(stateCount) || stateCount > limit - count) {
      return { count: limit, exceededLimit: true };
    }
    count += stateCount;
  }

  return { count, exceededLimit: false };
}

export function* effectiveCompositionStates(
  prompt: ParsedPrompt,
  limit: number
): Generator<EffectiveCompositionState> {
  validateLimit(limit);
  let count = 0;

  for (const values of effectiveVariableCombinations(prompt)) {
    for (const optionValues of effectiveOptionCombinations(prompt, values)) {
      if (count >= limit) return;
      count += 1;
      yield { values, optionValues };
    }
  }
}

function* effectiveVariableCombinations(prompt: ParsedPrompt): Generator<VariableValues> {
  const variables = variablesInApplicabilityOrder(prompt.variables);

  function* visit(index: number, state: VariableValues): Generator<VariableValues> {
    if (index >= variables.length) {
      yield state;
      return;
    }

    const variable = variables[index];
    const applicability = evaluatePromptApplicability(prompt, state).variables[variable.name];
    if (!applicability?.visible || !applicability.enabled) {
      yield* visit(index + 1, state);
      return;
    }

    for (const value of matrixValues(variable)) {
      yield* visit(index + 1, { ...state, [variable.name]: value });
    }
  }

  yield* visit(0, initialVariableValues(prompt.variables));
}

function* effectiveOptionCombinations(
  prompt: ParsedPrompt,
  values: VariableValues
): Generator<OptionValues> {
  const applicability = evaluatePromptApplicability(prompt, values);
  const disabledOptions = Object.fromEntries(prompt.options.map((option) => [option.id, false]));
  const availableOptions = prompt.options.filter((option) => {
    const state = applicability.options[option.id];
    return state?.visible && state.enabled;
  });

  function* visit(index: number, state: OptionValues): Generator<OptionValues> {
    if (index >= availableOptions.length) {
      yield state;
      return;
    }

    const option = availableOptions[index];
    yield* visit(index + 1, { ...state, [option.id]: false });
    yield* visit(index + 1, { ...state, [option.id]: true });
  }

  yield* visit(0, disabledOptions);
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

function validateLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError('Composition matrix limit must be a non-negative safe integer.');
  }
}
