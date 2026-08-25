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
const purposeGuidance = {
  general: 'General analysis:',
  brainstorm: 'Brainstorm:',
  technicalDesign: 'Technical design:'
} as const;
const directOpening = 'Open with the direct answer or decision implication in one or two natural sentences, not a formal brief.';
const diagramContract = 'Diagram integrity:';
const artifactOverlap = 'Artifact overlap:';
const semanticStop = 'Stop when adequately supported.';

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
        expect(result.text).not.toContain(diagramContract);
        expect(result.text).not.toContain(artifactOverlap);
        for (const artifact of technicalArtifacts) {
          expect(result.text).not.toContain(artifact.marker);
        }
      }
    }
  });

  it('opens naturally and keeps purpose guidance isolated without report-opening leakage', () => {
    const prompt = builtinPrompt('investigate-a-topic');

    for (const purpose of Object.keys(purposeGuidance) as Array<keyof typeof purposeGuidance>) {
      const result = compose(prompt, { purpose, technicalScope: 'fullStack' }, selectOptions(prompt));

      expect(occurrenceCount(result.text, directOpening)).toBe(1);
      expect(result.text).not.toContain('Opening —');
      expect(result.text).not.toMatch(/\b(?:Executive summary|Decision brief)\b/);
      for (const [otherPurpose, marker] of Object.entries(purposeGuidance)) {
        expect(result.text.includes(marker)).toBe(otherPurpose === purpose);
      }
    }
  });

  it('uses connected prose, a conditional semantic stop, and no closing recap', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const result = compose(prompt, { purpose: 'general' }, selectOptions(prompt));

    expect(occurrenceCount(result.text, 'Keep evidence beside its claim and related reasoning in connected paragraphs.')).toBe(1);
    expect(result.text).toContain('Use headings, lists, and tables only when their structure helps.');
    expect(occurrenceCount(result.text, semanticStop)).toBe(1);
    expect(result.text).toContain('only when material');
    expect(result.text).toContain('omit empty sections, research narration, source dumps, and closing recaps');
    expect(occurrenceCount(result.text, 'closing recap')).toBe(1);
  });

  it('composes one compressed diagram contract and only the selected artifact grammar', () => {
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

    expect(occurrenceCount(noArtifacts.text, diagramContract)).toBe(1);
    expect(noArtifacts.text).toContain('use evidence-backed elements and one decision question, grammar, and abstraction level per selected view');
    expect(noArtifacts.text).toContain('Keep names and boundaries consistent');
    expect(noArtifacts.text).toContain('inspect host-native rendering before claiming validity');
    expect(noArtifacts.text).toContain('keep unknowns outside diagrams or mark material uncertainty as `[Uncertain]`');
    expect(noArtifacts.text).toContain('dashed relationships mean asynchronous flow');
    expect(noArtifacts.text).not.toContain('Data flow and trust boundaries:');
    expect(occurrenceCount(dataFlow.text, diagramContract)).toBe(1);
    expect(dataFlow.text).toContain('typed `Producer`, `Consumer`, or `Transform` rectangles');
    expect(dataFlow.text).toContain('Use `-->` for synchronous and `-.->` for asynchronous data movement');
    expect(dataFlow.text).not.toContain('Sequence diagram:');
  });

  it('requests only materially distinct mockup states', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const result = compose(
      prompt,
      { purpose: 'technicalDesign', technicalScope: 'frontend' },
      selectOptions(prompt, 'uiMockups')
    );

    expect(occurrenceCount(result.text, 'UI mockups:')).toBe(1);
    expect(result.text).toContain('Include only states with materially different behavior, risk, or recovery');
    expect(result.text).toContain('do not add default, loading, empty, error, or narrow-width variants unless they are materially distinct');
    expect(result.text).not.toContain('show default, loading, empty, error, and narrow-width states');
  });

  it('requires strict, explained subsumption for overlapping selected artifacts', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const result = compose(
      prompt,
      { purpose: 'technicalDesign', technicalScope: 'fullStack' },
      selectOptions(prompt, 'systemArchitecture', 'apiDataFlowDiagram')
    );

    expect(occurrenceCount(result.text, artifactOverlap)).toBe(1);
    expect(result.text).toContain('preserves its material entities, relationships, order, states, boundaries, failures, and uncertainty');
    expect(result.text).toContain('Name and justify the substitute; otherwise include both.');
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

  it('selects exactly one investigation-depth branch', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const depthMarkers = {
      brief: 'limit evidence collection to the minimum needed to answer confidently',
      focused: 'follow the relevant implementation and decision paths',
      deep: 'expand across subsystem boundaries, history, edge cases, and competing explanations'
    } as const;

    for (const [analysisDepth, expectedMarker] of Object.entries(depthMarkers)) {
      const result = compose(prompt, { purpose: 'general', analysisDepth }, selectOptions(prompt));

      expect(result.text).toContain(expectedMarker);
      for (const marker of Object.values(depthMarkers).filter((candidate) => candidate !== expectedMarker)) {
        expect(result.text).not.toContain(marker);
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
    expect(result.text).toContain('Represent people as stadiums');
    expect(result.text).toContain('deployable containers or services as rectangles');
    expect(result.text).toContain('Put decomposition in a separate Component zoom');
    expect(result.text).toContain('do not mix levels or use this view for runtime order or payload movement');
    expect(result.text).toContain('Sequence diagram: use Mermaid sequence syntax for one scenario');
    expect(result.text).toContain('Use `->>` for synchronous calls, `-)` for asynchronous sends, and `-->>` for returns;');
    expect(result.text).toContain('Activity/workflow diagram: use Mermaid flowchart syntax with UML activity meanings');
    expect(result.text).toContain('do not use this view for runtime message order or timing.');
    expect(result.text).toContain('Data flow and trust boundaries: use Mermaid flowchart syntax');
    expect(occurrenceCount(result.text, diagramContract)).toBe(1);
    expect(occurrenceCount(result.text, artifactOverlap)).toBe(1);
    expect(result.text).toContain('Keep names and boundaries consistent');
  });

  it('keeps the exact investigation matrix unchanged', () => {
    const prompt = builtinPrompt('investigate-a-topic');
    const cardinality = effectiveMatrixCardinality(prompt, 4096);

    expect(cardinality).toEqual({ count: 1164, exceededLimit: false });
  });

  it('retains implementation controls and defaults with pull-request delivery off', () => {
    const prompt = builtinPrompt('implementation-plan');

    expect(prompt.modelRoles).toEqual({
      model: {
        label: 'Approved execution model',
        description: 'Used by approved implementation workers.'
      },
      rubberDuckModel: {
        label: 'Planning and review model',
        description: 'Used to critique the plan and review material execution boundaries.'
      }
    });
    expect(prompt.variables.map((variable) => ({
      name: variable.name,
      control: variable.control,
      defaultValue: variable.defaultValue,
      required: variable.required,
      choices: variable.choices?.map((choice) => choice.id)
    }))).toEqual([
      {
        name: 'executionTarget',
        control: 'select',
        defaultValue: 'nativeSubagents',
        required: true,
        choices: ['currentSession', 'nativeSubagents', 'independentSessions']
      },
      {
        name: 'technicalScope',
        control: 'select',
        defaultValue: 'infer',
        required: true,
        choices: ['infer', 'frontend', 'backend', 'fullStack']
      },
      {
        name: 'goal',
        control: undefined,
        defaultValue: undefined,
        required: true,
        choices: undefined
      },
      {
        name: 'context',
        control: undefined,
        defaultValue: 'Use the current conversation, prior analysis, and repository state.',
        required: false,
        choices: undefined
      },
      {
        name: 'constraints',
        control: undefined,
        defaultValue: 'none stated',
        required: false,
        choices: undefined
      }
    ]);
    expect(prompt.options.map((option) => [option.id, option.defaultEnabled])).toEqual([
      ['contractsAndIntegration', true],
      ['testsAndProof', true],
      ['operationsAndRollout', false],
      ['docsAndConfiguration', false],
      ['pullRequestDelivery', false]
    ]);
  });

  it('keeps implementation planning scope-aware without recreating technical design', () => {
    const prompt = builtinPrompt('implementation-plan');
    const expectedScopeText = {
      infer: 'Infer affected surfaces from context and inspected repository evidence',
      frontend: 'Cover relevant interaction, state, accessibility, responsiveness, component, and service boundaries.',
      backend: 'Cover relevant API, domain, persistence, migration, failure, security, observability, and data-flow boundaries.',
      fullStack: 'Split frontend and backend only when useful'
    };

    for (const [technicalScope, expected] of Object.entries(expectedScopeText)) {
      const result = compose(prompt, {
        goal: 'Deliver the agreed change.',
        technicalScope,
        executionTarget: 'currentSession'
      });
      expect(result.canCopy).toBe(true);
      expect(result.text).toContain(expected);
      expect(result.text).toContain('Reuse prior analysis and artifacts');
      expect(result.text).toContain('Add Plan at a Glance or an execution/worktree map only when');
      expect(result.text).not.toContain(modelValues.model);
      for (const other of Object.values(expectedScopeText).filter((value) => value !== expected)) {
        expect(result.text).not.toContain(other);
      }
    }
  });

  it('forbids invented planning requirements and unsupported analysis claims', () => {
    const implementation = builtinPrompt('implementation-plan');
    const investigation = builtinPrompt('investigate-a-topic');
    const noInventedRequirements = 'Do not invent requirements, schema fields, timelines, versions, or work not supported by context or inspected evidence.';
    const unresolvedChoices = 'Surface unresolved choices and keep dependent work provisional until they are decided.';

    expect(occurrenceCount(implementation.template, noInventedRequirements)).toBe(1);
    expect(occurrenceCount(implementation.template, unresolvedChoices)).toBe(1);

    for (const executionTarget of ['currentSession', 'nativeSubagents', 'independentSessions']) {
      const result = compose(
        implementation,
        { goal: 'Deliver only the supported change.', technicalScope: 'infer', executionTarget },
        selectOptions(implementation)
      );

      expect(occurrenceCount(result.text, noInventedRequirements)).toBe(1);
      expect(occurrenceCount(result.text, unresolvedChoices)).toBe(1);
    }

    const investigationResult = compose(
      investigation,
      { purpose: 'general', analysisDepth: 'focused' },
      selectOptions(investigation)
    );
    expect(investigationResult.text).toContain('Ground system-behavior claims in inspected files and symbols.');
    expect(investigationResult.text).toContain('admit unverifiable gaps.');
  });

  it('has exactly 384 effective implementation states', () => {
    const prompt = builtinPrompt('implementation-plan');

    expect(effectiveMatrixCardinality(prompt, 4096)).toEqual({ count: 384, exceededLimit: false });
  });

  it('keeps baseline safety while independently composing tests and pull-request delivery', () => {
    const prompt = builtinPrompt('implementation-plan');
    const values = {
      goal: 'Deliver the agreed change.',
      technicalScope: 'infer',
      executionTarget: 'currentSession'
    };
    const cases = [
      {
        name: 'all-off',
        options: selectOptions(prompt),
        tests: false,
        pullRequest: false,
        fallback: true
      },
      {
        name: 'PR-only',
        options: selectOptions(prompt, 'pullRequestDelivery'),
        tests: false,
        pullRequest: true,
        fallback: false
      },
      {
        name: 'tests-only',
        options: selectOptions(prompt, 'testsAndProof'),
        tests: true,
        pullRequest: false,
        fallback: false
      },
      {
        name: 'tests+PR',
        options: selectOptions(prompt, 'testsAndProof', 'pullRequestDelivery'),
        tests: true,
        pullRequest: true,
        fallback: false
      }
    ] as const;

    for (const scenario of cases) {
      const result = compose(prompt, values, scenario.options);

      expect(result.text, scenario.name).toContain('Required checks must pass before dependent consumption, merges, migrations, rollout, irreversible changes, or another material boundary.');
      expect(result.text.includes('Put commands, outcomes, failure signals, and targeted versus final coverage in Done when.'), scenario.name).toBe(scenario.tests);
      expect(result.text.includes('create the required pull requests'), scenario.name).toBe(scenario.pullRequest);
      expect(result.text.includes('put regression-preventing test evidence in each description and a comment'), scenario.name).toBe(scenario.pullRequest);
      expect(result.text.includes('No extra concerns selected.'), scenario.name).toBe(scenario.fallback);
      if (!scenario.pullRequest) {
        expect(result.text, scenario.name).not.toMatch(/\bpull request\b/i);
      }
    }
  });

  it('uses an adaptive simple sequence for every execution target without mandatory wave ceremony', () => {
    const prompt = builtinPrompt('implementation-plan');
    const executionMarkers = {
      currentSession: 'Approved execution — current session:',
      nativeSubagents: 'Approved execution — native subagents:',
      independentSessions: 'Approved execution — independent sessions:'
    } as const;

    for (const [executionTarget, marker] of Object.entries(executionMarkers)) {
      const result = compose(
        prompt,
        { goal: 'Make one localized change.', technicalScope: 'infer', executionTarget },
        selectOptions(prompt)
      );

      expect(result.text).toContain(marker);
      expect(result.text).toContain('Infer one sequence or multiple waves from dependency, concurrency, risk, migration, rollout, and irreversibility; use waves only when those boundaries help.');
      expect(result.text).toContain('For each sequence or wave use **Outcome**, **Work**, and **Done when**');
      expect(result.text).toContain('Required checks must pass before dependent consumption, merges, migrations, rollout, irreversible changes, or another material boundary.');
      expect(result.text).toContain('Add Plan at a Glance or an execution/worktree map only when complexity, risk, concurrency, ordering, or handoffs require one.');

      const targetBranch = result.text.split('\n').find((line) => line.includes(marker));
      expect(targetBranch).toBeDefined();
      expect(targetBranch).not.toMatch(/\bmultiple waves\b|\bexecution(?:\/worktree)? map\b|review (?:each|every) wave/i);
    }
  });

  it('retains execution-target isolation, handoff, and recovery without leaking target branches', () => {
    const prompt = builtinPrompt('implementation-plan');
    const options = selectOptions(prompt);
    const current = compose(
      prompt,
      { goal: 'Deliver the agreed change.', technicalScope: 'infer', executionTarget: 'currentSession' },
      options
    );
    const native = compose(
      prompt,
      { goal: 'Deliver the agreed change.', technicalScope: 'infer', executionTarget: 'nativeSubagents' },
      options
    );
    const independent = compose(
      prompt,
      { goal: 'Deliver the agreed change.', technicalScope: 'infer', executionTarget: 'independentSessions' },
      options
    );

    expect(current.text).toContain('implement directly after approval.');
    expect(current.text).toContain('Omit ownership, handoff, and worktree details unless material.');
    expect(current.text).not.toContain('One worker is allowed.');
    expect(current.text).not.toContain("Keep each session's brief");

    expect(native.text).toContain('One worker is allowed.');
    expect(native.text).toContain('Give each a standalone brief, file scope, and Done when');
    expect(native.text).toContain('keep needed dependencies, handoffs, result details, and recovery local');
    expect(native.text).toContain('Isolate concurrent writers that could collide in separate worktrees.');
    expect(native.text).not.toContain("Keep each session's brief");

    expect(independent.text).toContain('State shared repository, model, coordinator, and base once.');
    expect(independent.text).toContain("Keep each session's brief, scope, Done when, branch/worktree, result path, context/reasoning guidance, recovery, and needed dependencies or merge order together.");
    expect(independent.text).toContain('Give concurrent sessions separate worktrees; the coordinator reviews, merges, and advances dependencies.');
    expect(independent.text).not.toContain('One worker is allowed.');
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
        'Infer one sequence or multiple waves',
        'For each sequence or wave use **Outcome**, **Work**, and **Done when**',
        'Required checks must pass before dependent consumption',
        'do not implement before approval.'
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

    expect(native.text).toContain(`native ${modelValues.model} workers`);
    expect(independentFullStack.text).toContain(`sessions with ${modelValues.model}`);
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
    expect(implementationDefault.text).toContain('use independent Copilot CLI sessions after approval');
    expect(implementationDefault.text).not.toContain(modelValues.model);
    expect(implementationDefault.text).not.toContain(modelValues.rubberDuckModel);
    expect(implementationExplicit.text).toContain(`use independent Copilot CLI sessions with ${modelValues.model} after approval`);
    expect(implementationExplicit.text).not.toContain(modelValues.rubberDuckModel);

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
