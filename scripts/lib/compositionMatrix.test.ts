import { describe, expect, it } from 'vitest';
import type { ParsedPrompt, PromptVariable } from '../../src/data/schemas';
import {
  effectiveCompositionStates,
  effectiveMatrixCardinality
} from './compositionMatrix';

describe('effective composition matrix', () => {
  it('enumerates variables after their applicability dependencies and suppresses unavailable options', () => {
    const prompt = matrixPrompt();
    const states = [...effectiveCompositionStates(prompt, 14)];

    expect(effectiveMatrixCardinality(prompt, 14)).toEqual({
      count: 14,
      exceededLimit: false
    });
    expect(states).toHaveLength(14);
    expect(states.filter(({ values }) => values.purpose === 'general')).toHaveLength(2);
    expect(states.filter(({ values }) => values.purpose === 'technicalDesign')).toHaveLength(12);

    for (const state of states.filter(({ values }) => values.purpose === 'general')) {
      expect(state.values.technicalScope).toBe('frontend');
      expect(state.optionValues).toMatchObject({
        parallelAgents: expect.any(Boolean),
        systemArchitecture: false,
        uiMockups: false
      });
    }

    for (const state of states.filter(({ values }) => values.technicalScope === 'backend')) {
      expect(state.optionValues.uiMockups).toBe(false);
    }
  });

  it('stops cardinality counting before materializing a huge variable space', () => {
    const prompt = hugeVariablePrompt();

    expect(effectiveMatrixCardinality(prompt, 4096)).toEqual({
      count: 4096,
      exceededLimit: true
    });
  });

  it('bounds lazy state enumeration for a huge variable space', () => {
    const states = [...effectiveCompositionStates(hugeVariablePrompt(), 5)];

    expect(states).toHaveLength(5);
    expect(new Set(states.map(({ values }) => JSON.stringify(values))).size).toBe(5);
  });
});

function matrixPrompt(): ParsedPrompt {
  const variables: PromptVariable[] = [
    {
      name: 'technicalScope',
      label: 'Technical scope',
      required: true,
      control: 'select',
      defaultValue: 'frontend',
      visibleWhen: { purpose: ['technicalDesign'] },
      choices: [
        { id: 'frontend', label: 'Frontend' },
        { id: 'backend', label: 'Backend' }
      ]
    },
    {
      name: 'purpose',
      label: 'Purpose',
      required: true,
      control: 'select',
      defaultValue: 'general',
      choices: [
        { id: 'general', label: 'General' },
        { id: 'technicalDesign', label: 'Technical design' }
      ]
    }
  ];

  return {
    id: 'matrix-test',
    title: 'Matrix test',
    category: 'analysis',
    kind: 'prompt',
    tags: [],
    variables,
    options: [
      {
        id: 'parallelAgents',
        label: 'Parallel agents',
        defaultEnabled: false
      },
      {
        id: 'systemArchitecture',
        label: 'System architecture',
        defaultEnabled: false,
        visibleWhen: { purpose: ['technicalDesign'] }
      },
      {
        id: 'uiMockups',
        label: 'UI mockups',
        defaultEnabled: false,
        visibleWhen: { purpose: ['technicalDesign'] },
        enabledWhen: { technicalScope: ['frontend'] }
      }
    ],
    template: 'Matrix.',
    path: 'prompts/matrix-test.md'
  };
}

function hugeVariablePrompt(): ParsedPrompt {
  const variables = Array.from({ length: 20 }, (_, variableIndex): PromptVariable => ({
    name: `variable${variableIndex}`,
    label: `Variable ${variableIndex}`,
    required: true,
    control: 'select',
    defaultValue: 'choice0',
    choices: Array.from({ length: 10 }, (_, choiceIndex) => ({
      id: `choice${choiceIndex}`,
      label: `Choice ${choiceIndex}`
    }))
  }));

  return {
    id: 'huge-matrix-test',
    title: 'Huge matrix test',
    category: 'analysis',
    kind: 'prompt',
    tags: [],
    variables,
    options: [],
    template: 'Huge matrix.',
    path: 'prompts/huge-matrix-test.md'
  };
}
