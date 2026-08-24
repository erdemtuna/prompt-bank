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
    label: 'Data flow and trust boundaries',
    marker: 'Data flow and trust boundaries:',
    scopes: technicalScopes
  }
] as const;
const coherenceMarker = 'Technical-design coherence:';
const notationMarker = 'Diagram house rules:';
const purposeOpenings = {
  general: 'Opening — executive summary:',
  brainstorm: 'Opening — option map:',
  technicalDesign: 'Opening — decision brief:'
} as const;

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
  it('retains the investigation controls, defaults, option ids, and applicability matrix', () => {
    const prompt = builtinPrompt('investigate-a-topic');

    expect(prompt.variables.map((variable) => ({
      name: variable.name,
      control: variable.control,
      defaultValue: variable.defaultValue,
      choices: variable.choices?.map((choice) => [choice.id, choice.label]),
      visibleWhen: variable.visibleWhen
    }))).toEqual([
      {
        name: 'purpose',
        control: 'select',
        defaultValue: 'technicalDesign',
        choices: [
          ['general', 'General analysis'],
          ['brainstorm', 'Brainstorm'],
          ['technicalDesign', 'Technical design']
        ],
        visibleWhen: undefined
      },
      {
        name: 'technicalScope',
        control: 'select',
        defaultValue: 'infer',
        choices: [
          ['infer', 'Infer'],
          ['frontend', 'Frontend'],
          ['backend', 'Backend'],
          ['fullStack', 'Full-stack']
        ],
        visibleWhen: { purpose: ['technicalDesign'] }
      },
      {
        name: 'analysisDepth',
        control: 'slider',
        defaultValue: 'focused',
        choices: [
          ['brief', 'Brief'],
          ['focused', 'Focused'],
          ['deep', 'Deep']
        ],
        visibleWhen: undefined
      },
      {
        name: 'intent',
        control: undefined,
        defaultValue: 'Use the current conversation, prior analysis, and repository state.',
        choices: undefined,
        visibleWhen: undefined
      }
    ]);
    expect(prompt.options.map((option) => ({
      id: option.id,
      label: option.label,
      defaultEnabled: option.defaultEnabled,
      visibleWhen: option.visibleWhen,
      enabledWhen: option.enabledWhen
    }))).toEqual([
      {
        id: 'parallelAgents',
        label: 'Parallel agents',
        defaultEnabled: true,
        visibleWhen: undefined,
        enabledWhen: undefined
      },
      ...technicalArtifacts.map((artifact) => ({
        id: artifact.id,
        label: artifact.label,
        defaultEnabled: false,
        visibleWhen: { purpose: ['technicalDesign'] },
        enabledWhen: artifact.id === 'uiMockups'
          ? { technicalScope: ['frontend', 'fullStack'] }
          : undefined
      }))
    ]);
  });

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
        expect(result.text).not.toContain(notationMarker);
        for (const artifact of technicalArtifacts) {
          expect(result.text).not.toContain(artifact.marker);
        }
      }
    }
  });

  it('uses exactly one purpose-specific opening without leaking other readability tiers', () => {
    const prompt = builtinPrompt('investigate-a-topic');

    for (const purpose of Object.keys(purposeOpenings) as Array<keyof typeof purposeOpenings>) {
      const result = compose(prompt, { purpose, technicalScope: 'fullStack' }, selectOptions(prompt));

      expect(occurrenceCount(result.text, purposeOpenings[purpose])).toBe(1);
      for (const [otherPurpose, marker] of Object.entries(purposeOpenings)) {
        expect(result.text.includes(marker)).toBe(otherPurpose === purpose);
      }
      expect(result.text).toContain('Lead with the result, recommendation, or decision implication.');
    }
  });

  it('applies the canonical notation once for technical design and only artifact-specific grammar when selected', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const noArtifacts = compose(
      prompt,
      { purpose: 'technicalDesign', technicalScope: 'fullStack' },
      selectOptions(prompt)
    );
    const dataFlow = compose(
      prompt,
      { purpose: 'technicalDesign', technicalScope: 'fullStack' },
      selectOptions(prompt, 'apiDataFlowDiagram')
    );

    expect(occurrenceCount(noArtifacts.text, notationMarker)).toBe(1);
    expect(noArtifacts.text).toContain('8–12 primary elements as a preferred overview range');
    expect(noArtifacts.text).toContain('split above 15 unless that would break one coherent scenario');
    expect(noArtifacts.text).toContain('Put missing facts in an adjacent `Unresolved` list outside the diagram');
    expect(noArtifacts.text).toContain('Dashed relationships remain reserved for asynchronous flow and never mean uncertainty');
    expect(noArtifacts.text).not.toContain('Data flow and trust boundaries:');
    expect(occurrenceCount(dataFlow.text, notationMarker)).toBe(1);
    expect(dataFlow.text).toContain('rectangles carrying `Producer`, `Consumer`, or `Transform` type text');
    expect(dataFlow.text).toContain('Use `-->` for synchronous data movement and `-.->` for asynchronous movement');
    expect(dataFlow.text).not.toContain('Sequence diagram:');
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

    expect(result.text).toContain('use conservative Mermaid flowchart syntax with C4 Container semantics');
    expect(result.text).toContain('stadium nodes for human actors');
    expect(result.text).toContain('rectangles for deployable containers or services');
    expect(result.text).toContain('Use a separate Component zoom only when one container needs decomposition');
    expect(result.text).toContain('do not mix levels or use this view for runtime order or payload movement');
    expect(result.text).toContain('For a greenfield system show only proposed `[Added]` elements');
    expect(result.text).toContain('Sequence diagram: use Mermaid sequence syntax for one scenario');
    expect(result.text).toContain('Use `->>` for synchronous calls, `-)` for asynchronous sends, and `-->>` for returns.');
    expect(result.text).toContain('Activity/workflow diagram: use Mermaid flowchart syntax with activity semantics');
    expect(result.text).toContain('do not use this view for runtime message order or timing.');
    expect(result.text).toContain('Data flow and trust boundaries: use Mermaid flowchart syntax');
    expect(occurrenceCount(result.text, coherenceMarker)).toBe(1);
    expect(result.text).toContain('use its container names and boundaries as the shared vocabulary');
    expect(result.text).toContain('each artifact must answer a different question');
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
      expect(result.text).toContain('Plan at a Glance');
      expect(result.text.indexOf('Execution map')).toBeLessThan(result.text.indexOf('ordered waves'));
      expect(result.text).toContain('outcome, scope, ownership, dependencies, implementation work, validation evidence, review gate, and completion contract');
      expect(result.text).not.toContain(modelValues.model);
      for (const other of Object.values(expectedScopeText).filter((value) => value !== expected)) {
        expect(result.text).not.toContain(other);
      }
    }
  });

  it('locks answer-first semantics and safety gates across the updated neutral built-ins', () => {
    const expectedMarkers = {
      'review-a-pull-request': [
        'Lead with a compact merge-readiness block:',
        'exactly one specific claim',
        'Do not reproduce reviewer reports',
        'Do not push commits or change the pull request unless I explicitly ask.'
      ],
      'review-working-tree-changes': [
        'Lead with a compact commit-readiness block:',
        'exactly one specific claim',
        'Do not reproduce reviewer reports',
        'Do not fix anything yet.'
      ],
      'implementation-plan': [
        'Plan at a Glance',
        'Execution map',
        'stable internal sequence',
        'Do not start implementing until the plan is approved.'
      ],
      'compare-approaches': [
        'Lead with the recommendation and the decisive criterion.',
        'conditions that would reverse the recommendation',
        'material uncertainty'
      ],
      'summarize-a-source': [
        'Treat `Length` as the budget for the entire response',
        "Keep the source's claims separate from implications or other inference",
        'Do not add a second summary.'
      ],
      'explain-a-codebase-area': [
        'Start with the governing mental model',
        'implication for changing this area safely',
        'file or symbol evidence next to each specific claim'
      ],
      'find-the-root-cause': [
        'lead the report with the diagnosis and confidence',
        'mechanism, proof, blast radius, credible alternatives',
        'Do not apply the fix until I confirm the diagnosis.'
      ]
    } as const;

    for (const [id, markers] of Object.entries(expectedMarkers)) {
      const template = builtinPrompt(id).template;
      for (const marker of markers) {
        expect(template, `${id} should retain "${marker}"`).toContain(marker);
      }
      expect(template).not.toMatch(/\bPersonal Assistant\b/i);
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
