import { describe, expect, it } from 'vitest';
import { composePrompt, initialOptionValues, initialVariableValues, type BuiltInValues, type OptionValues, type VariableValues } from './composer';
import { loadAppData } from './loaders';
import type { Prompt } from './schemas';
import { effectiveMatrixCardinality } from '../../scripts/lib/compositionMatrix';

const appData = loadAppData();
const modelValues = {
  model: 'GPT-5.6 Sol 128K context high reasoning',
  rubberDuckModel: 'GPT-5.6 Sol 128K context extra high reasoning'
};
const technicalScopes = ['infer', 'frontend', 'backend', 'fullStack'] as const;
const technicalArtifacts = [
  {
    id: 'systemArchitecture',
    label: 'System architecture',
    marker: 'System architecture:',
    scopes: technicalScopes
  },
  {
    id: 'uiMockups',
    label: 'UI mockups',
    marker: 'UI mockups:',
    scopes: ['frontend', 'fullStack']
  },
  {
    id: 'stateDiagram',
    label: 'State diagram',
    marker: 'State diagram:',
    scopes: technicalScopes
  },
  {
    id: 'sequenceDiagram',
    label: 'Sequence diagram',
    marker: 'Sequence diagram:',
    scopes: technicalScopes
  },
  {
    id: 'activityWorkflowDiagram',
    label: 'Activity/workflow diagram',
    marker: 'Activity/workflow diagram:',
    scopes: technicalScopes
  },
  {
    id: 'apiDataFlowDiagram',
    label: 'API/data-flow diagram',
    marker: 'API/data-flow diagram:',
    scopes: technicalScopes
  }
] as const;
const coherenceMarker = 'Technical-design coherence:';

function builtinPrompt(id: string): Prompt {
  const prompt = appData.prompts.find((candidate) => candidate.id === id);
  if (!prompt) throw new Error(`Missing built-in prompt "${id}".`);
  return prompt;
}

function compose(
  prompt: Prompt,
  values: VariableValues,
  optionValues: OptionValues = {},
  builtIns: BuiltInValues = modelValues
) {
  return composePrompt(
    prompt,
    { ...initialVariableValues(prompt.variables), ...values },
    builtIns,
    { optionValues: { ...initialOptionValues(prompt.options), ...optionValues } }
  );
}

function selectOptions(prompt: Prompt, ...enabledIds: string[]): OptionValues {
  const enabled = new Set(enabledIds);
  return Object.fromEntries(prompt.options.map((option) => [option.id, enabled.has(option.id)]));
}

function occurrenceCount(text: string, marker: string): number {
  return text.split(marker).length - 1;
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
    expect(prompt.options.map((option) => [option.id, option.label])).toEqual([
      ['parallelAgents', 'Parallel agents'],
      ...technicalArtifacts.map((artifact) => [artifact.id, artifact.label])
    ]);

    for (const purpose of ['general', 'brainstorm']) {
      for (const technicalScope of technicalScopes) {
        const result = compose(prompt, { purpose, technicalScope }, allOptionsEnabled);

        expect(result.canCopy).toBe(true);
        expect(result.text).not.toMatch(/Design scope —|Design outcome:|Technical-design coherence:|\barchitecture\b/i);
        for (const artifact of technicalArtifacts) {
          expect(result.text).not.toContain(artifact.marker);
        }
      }
    }
  });

  it('applies the locked technical artifact taxonomy only to available scopes', () => {
    const prompt = builtinPrompt('investigate-a-topic');

    for (const technicalScope of technicalScopes) {
      const result = compose(
        prompt,
        { purpose: 'technicalDesign', technicalScope },
        selectOptions(prompt, ...technicalArtifacts.map((artifact) => artifact.id))
      );

      for (const artifact of technicalArtifacts) {
        const expected = artifact.scopes.some((scope) => scope === technicalScope);
        expect(result.applicability.options[artifact.id]).toEqual({
          visible: true,
          enabled: expected
        });
        expect(result.text.includes(artifact.marker)).toBe(expected);
      }
    }
  });

  it('emits one independent marker for each technical artifact', () => {
    const prompt = builtinPrompt('investigate-a-topic');

    for (const artifact of technicalArtifacts) {
      const result = compose(
        prompt,
        { purpose: 'technicalDesign', technicalScope: artifact.scopes[0] },
        selectOptions(prompt, artifact.id)
      );

      expect(occurrenceCount(result.text, artifact.marker)).toBe(1);
      for (const other of technicalArtifacts.filter((candidate) => candidate.id !== artifact.id)) {
        expect(result.text).not.toContain(other.marker);
      }
    }
  });

  it('does not request architecture output when infer scope has all artifacts disabled', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const result = compose(
      prompt,
      { purpose: 'technicalDesign', technicalScope: 'infer' },
      selectOptions(prompt)
    );

    expect(result.text).not.toContain('System architecture:');
    expect(result.text).not.toMatch(/\b(?:include|provide|show|create|produce)\b[^\n.]*\barchitecture(?: diagram| view)\b/i);
    expect(result.text).toContain('State the inferred boundaries, ownership, and assumptions in prose.');
  });

  it('separates static architecture, runtime sequence, process flow, and data movement', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const result = compose(
      prompt,
      { purpose: 'technicalDesign', technicalScope: 'fullStack' },
      selectOptions(prompt, 'systemArchitecture', 'sequenceDiagram', 'activityWorkflowDiagram', 'apiDataFlowDiagram')
    );

    expect(result.text).toContain('static structural view of the major components, modules, or services');
    expect(result.text).toContain('responsibilities, boundaries, and static dependencies');
    expect(result.text).toContain('Do not use this view for runtime message order or data payload movement.');
    expect(result.text).toContain('for a greenfield system, show only the proposed architecture and do not invent an existing baseline.');
    expect(result.text).toContain('Sequence diagram: include a diagram showing participant ownership, runtime message order');
    expect(result.text).toContain('Activity/workflow diagram: include a diagram showing actors, process steps, decisions, branches');
    expect(result.text).toContain('Use it for process and decision flow, not runtime message order or timing.');
    expect(result.text).toContain('API/data-flow diagram: include a diagram showing contracts, trust boundaries, transformations, storage, and movement of data.');
    expect(occurrenceCount(result.text, coherenceMarker)).toBe(1);
    expect(result.text).toContain('use its component names and boundaries as the shared vocabulary');
    expect(result.text).toContain('each artifact must add a viewpoint the others do not');
  });

  it('keeps the effective investigation matrix below the unchanged safety limit', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const cardinality = effectiveMatrixCardinality(prompt, 4096);

    expect(cardinality).toEqual({ count: 1164, exceededLimit: false });
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

  it('omits only optional model fragments and restores exact built-in prompt sentences', () => {
    const investigate = builtinPrompt('investigate-a-topic');
    const investigateOptions = selectOptions(investigate, 'parallelAgents');
    const investigateDefault = compose(investigate, {}, investigateOptions, {});
    const investigateExplicit = compose(investigate, {}, investigateOptions);
    expect(investigateDefault.text).toContain('give each one to an agent with a standalone brief.');
    expect(investigateExplicit.text).toContain(`give each one to an agent using ${modelValues.model} with a standalone brief.`);

    const implementation = builtinPrompt('implementation-plan');
    const implementationDefault = compose(implementation, {
      goal: 'Deliver the agreed change.',
      technicalScope: 'infer',
      executionTarget: 'independentSessions'
    }, {}, {});
    const implementationExplicit = compose(implementation, {
      goal: 'Deliver the agreed change.',
      technicalScope: 'infer',
      executionTarget: 'independentSessions'
    });
    expect(implementationDefault.text).toContain('use native reviewers to check the wave');
    expect(implementationDefault.text).toContain('independent Copilot CLI sessions.');
    expect(implementationDefault.text).toContain('have agents critique it');
    expect(implementationExplicit.text).toContain(`use native ${modelValues.rubberDuckModel} reviewers to check the wave`);
    expect(implementationExplicit.text).toContain(`independent Copilot CLI sessions using ${modelValues.model}.`);
    expect(implementationExplicit.text).toContain(`have ${modelValues.rubberDuckModel} agents critique it`);

    const reviewPullRequest = builtinPrompt('review-a-pull-request');
    const reviewDefault = compose(reviewPullRequest, {}, {}, {});
    const reviewExplicit = compose(reviewPullRequest, {});
    expect(reviewDefault.text).toContain('Perform the primary review, and use a set of reviewers as independent second opinions.');
    expect(reviewExplicit.text).toContain(
      `Perform the primary review using ${modelValues.model}, and use a set of reviewers using ${modelValues.rubberDuckModel} as independent second opinions.`
    );

    const compare = builtinPrompt('compare-approaches');
    const compareOptions = selectOptions(compare, 'steelman');
    const compareDefault = compose(compare, { decision: 'Choose an approach.', approaches: 'A and B.' }, compareOptions, {});
    const compareExplicit = compose(compare, { decision: 'Choose an approach.', approaches: 'A and B.' }, compareOptions);
    expect(compareDefault.text).toContain('have a rubber-duck reviewer build the strongest honest case');
    expect(compareExplicit.text).toContain(`have a rubber-duck reviewer using ${modelValues.rubberDuckModel} build the strongest honest case`);

    const workingTree = builtinPrompt('review-working-tree-changes');
    const workingTreeDefault = compose(workingTree, {}, {}, {});
    const workingTreeExplicit = compose(workingTree, {});
    expect(workingTreeDefault.text).toContain('Use reviewers as a second opinion');
    expect(workingTreeExplicit.text).toContain(`Use ${modelValues.rubberDuckModel} reviewers as a second opinion`);
  });

  it('keeps both built-ins free of first-person personal wording', () => {
    for (const id of ['investigate-a-topic', 'implementation-plan']) {
      expect(builtinPrompt(id).template).not.toMatch(/\b(?:I|me|my|mine)\b/i);
    }
  });
});
