import { describe, expect, it } from 'vitest';
import { composePrompt, initialOptionValues, initialVariableValues, type OptionValues, type VariableValues } from './composer';
import { loadAppData } from './loaders';
import type { Prompt } from './schemas';

const appData = loadAppData();
const modelValues = {
  model: 'GPT-5.6 Sol 128K context high reasoning',
  rubberDuckModel: 'GPT-5.6 Sol 128K context extra high reasoning'
};

function builtinPrompt(id: string): Prompt {
  const prompt = appData.prompts.find((candidate) => candidate.id === id);
  if (!prompt) throw new Error(`Missing built-in prompt "${id}".`);
  return prompt;
}

function compose(
  prompt: Prompt,
  values: VariableValues,
  optionValues: OptionValues = {}
) {
  return composePrompt(
    prompt,
    { ...initialVariableValues(prompt.variables), ...values },
    modelValues,
    { optionValues: { ...initialOptionValues(prompt.options), ...optionValues } }
  );
}

describe('Wave 2B built-in prompts', () => {
  it('keeps non-technical investigation purposes free of scope and artifact output', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const allOptionsEnabled = Object.fromEntries(prompt.options.map((option) => [option.id, true]));

    expect(prompt.modelRoles?.model).toEqual({
      label: 'Investigation model',
      description: 'Used by parallel investigation agents.'
    });
    expect(prompt.variables.find((variable) => variable.name === 'technicalScope')?.visibleWhen)
      .toEqual({ purpose: ['technicalDesign'] });

    for (const purpose of ['general', 'brainstorm']) {
      for (const technicalScope of ['infer', 'frontend', 'backend', 'fullStack']) {
        const result = compose(prompt, { purpose, technicalScope }, allOptionsEnabled);

        expect(result.canCopy).toBe(true);
        expect(result.text).not.toMatch(/Design scope —|Design outcome:|UI mockups:|State diagram:|Sequence diagram:|Use-case or activity diagram:|API or data-flow diagram:/);
      }
    }
  });

  it('applies investigation artifacts only to available technical scopes', () => {
    const prompt = builtinPrompt('investigate-a-topic');

    const frontend = compose(prompt, { purpose: 'technicalDesign', technicalScope: 'frontend' }, {
      uiMockups: true,
      apiDataFlowDiagram: true
    });
    const backend = compose(prompt, { purpose: 'technicalDesign', technicalScope: 'backend' }, {
      uiMockups: true,
      apiDataFlowDiagram: true
    });

    expect(frontend.text).toContain('Design scope — frontend:');
    expect(frontend.text).toContain('UI mockups:');
    expect(frontend.text).toContain('API or data-flow diagram:');
    expect(backend.text).toContain('Design scope — backend:');
    expect(backend.text).not.toContain('UI mockups:');
    expect(backend.text).toContain('API or data-flow diagram:');
  });

  it('keeps implementation planning scope-aware without recreating technical design', () => {
    const prompt = builtinPrompt('implementation-plan');
    const expectedScopeText = {
      infer: 'Technical scope — infer:',
      frontend: 'Technical scope — frontend:',
      backend: 'Technical scope — backend:',
      fullStack: 'Technical scope — full-stack:'
    };

    expect(prompt.modelRoles).toEqual({
      model: {
        label: 'Approved execution model',
        description: 'Used by approved implementation workers.'
      },
      rubberDuckModel: {
        label: 'Planning and review model',
        description: 'Used to critique the plan and review execution waves.'
      }
    });
    expect(prompt.options.map((option) => [option.id, option.defaultEnabled])).toEqual([
      ['contractsAndIntegration', true],
      ['testsAndProof', true],
      ['operationsAndRollout', false],
      ['docsAndConfiguration', false]
    ]);

    for (const [technicalScope, expected] of Object.entries(expectedScopeText)) {
      const result = compose(prompt, {
        goal: 'Deliver the agreed change.',
        technicalScope,
        executionTarget: 'currentSession'
      });

      expect(result.canCopy).toBe(true);
      expect(result.text).toContain(expected);
      expect(result.text).toContain('Do not recreate a rigorous technical-design report.');
      expect(result.text).not.toContain(modelValues.model);
      for (const other of Object.values(expectedScopeText).filter((value) => value !== expected)) {
        expect(result.text).not.toContain(other);
      }
    }
  });

  it('uses execution models only in active implementation branches and supports compound full-stack guidance', () => {
    const prompt = builtinPrompt('implementation-plan');
    const native = compose(prompt, {
      goal: 'Deliver the agreed change.',
      technicalScope: 'backend',
      executionTarget: 'nativeSubagents'
    });
    const independentFullStack = compose(prompt, {
      goal: 'Deliver the agreed change.',
      technicalScope: 'fullStack',
      executionTarget: 'independentSessions'
    });

    expect(native.text).toContain(`native ${modelValues.model} subagents`);
    expect(independentFullStack.text).toContain(`sessions using ${modelValues.model}`);
    expect(independentFullStack.text).toContain('Full-stack independent execution:');
  });

  it('keeps both built-ins free of first-person personal wording', () => {
    for (const id of ['investigate-a-topic', 'implementation-plan']) {
      expect(builtinPrompt(id).template).not.toMatch(/\b(?:I|me|my|mine)\b/i);
    }
  });
});
