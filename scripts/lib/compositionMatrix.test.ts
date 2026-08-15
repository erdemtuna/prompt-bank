import { describe, expect, it } from 'vitest';
import type { ParsedPrompt, PromptVariable } from '../../src/data/schemas';
import {
  effectiveCompositionStates,
  effectiveMatrixCardinality
} from './compositionMatrix';

describe('effective composition matrix', () => {
  it('enumerates variables after their applicability dependencies and suppresses unavailable options', () => {
    const prompt = matrixPrompt();
    const states = effectiveCompositionStates(prompt);

    expect(effectiveMatrixCardinality(prompt)).toBe(14);
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
