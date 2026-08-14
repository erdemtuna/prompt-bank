import { describe, expect, it } from 'vitest';
import { composeModelLabel, composePrompt, initialOptionValues, initialVariableValues, normalizeOptionValues, promptUsesModelPlaceholder, promptUsesRubberDuckModelPlaceholder } from './composer';
import { builtinPresetsRaw, builtinPromptSources, loadAppData, loadAppDataFromSources, resolvePromptsForApp } from './loaders';
import { extractConditionVariableNames, parseModelPresets, parsePromptFile, renderPromptTemplateConditions, renderPromptTemplateControls, validatePromptCollection, type Prompt, type PromptIdentity, type PromptOption } from './schemas';
import { formatCount, shouldUseTextarea } from '../components/promptUi';

describe('composer', () => {
  it('interpolates variables using double brace placeholders', () => {
    const prompt = makePrompt('Hello {{ name }} from {{place}}.');
    const result = composePrompt(prompt, { name: 'Ada', place: 'London' });

    expect(result.text).toBe('Hello Ada from London.');
    expect(result.isValid).toBe(true);
  });

  it('interpolates built-in model values without declared variables', () => {
    const prompt = makePrompt('Use {{model}} for {{name}} and {{rubberDuckModel}} for critique.');
    const result = composePrompt(prompt, { name: 'review', place: 'repo' }, { model: 'GPT-5.5', rubberDuckModel: 'GPT-5.5 extra high' });

    expect(result.text).toBe('Use GPT-5.5 for review and GPT-5.5 extra high for critique.');
    expect(result.isValid).toBe(true);
    expect(result.canCopy).toBe(true);
    expect(result.usesModelPlaceholder).toBe(true);
    expect(result.usesRubberDuckModelPlaceholder).toBe(true);
  });

  it('requires valid model presets only for built-in model placeholders that are used', () => {
    const modelPrompt = makePrompt('Use {{model}} for {{name}} and {{rubberDuckModel}} for critique.');
    const modelResult = composePrompt(modelPrompt, { name: 'review', place: 'repo' }, { model: 'GPT-5.5' });
    const noModelPrompt = makePrompt('Review {{name}} in {{place}}.');
    const noModelResult = composePrompt(noModelPrompt, { name: 'code', place: 'repo' });

    expect(modelResult.canCopy).toBe(false);
    expect(modelResult.missingBuiltIns).toEqual(['rubberDuckModel']);
    expect(modelResult.text).toBe('Use GPT-5.5 for review and {{rubberDuckModel}} for critique.');
    expect(noModelResult.canCopy).toBe(true);
    expect(noModelResult.missingBuiltIns).toEqual([]);
  });

  it('detects model placeholder usage', () => {
    expect(promptUsesModelPlaceholder(makePrompt('Use {{ model }}.'))).toBe(true);
    expect(promptUsesRubberDuckModelPlaceholder(makePrompt('Use {{ rubberDuckModel }}.'))).toBe(true);
    expect(promptUsesModelPlaceholder(makePrompt('No built-in placeholder.'))).toBe(false);
    expect(promptUsesRubberDuckModelPlaceholder(makePrompt('No built-in placeholder.'))).toBe(false);
  });

  it('disables composition validity when required values are empty', () => {
    const prompt = makePrompt('Hello {{ name }}.');
    const result = composePrompt(prompt, { name: ' ' });

    expect(result.isValid).toBe(false);
    expect(result.canCopy).toBe(false);
    expect(result.missingRequired).toEqual(['name', 'place']);
  });

  it('blocks copy for validation issues tied to the prompt path', () => {
    const prompt = makePrompt('Hello {{ name }} from {{place}}.', 'duplicate', undefined, 'prompts/a.md');
    const result = composePrompt(prompt, { name: 'Ada', place: 'London' }, {}, {
      validationIssues: [{ scope: 'prompt', path: 'prompts/a.md', message: 'Duplicate prompt id "duplicate".' }]
    });

    expect(result.canCopy).toBe(false);
    expect(result.validationBlockers).toEqual(['prompts/a.md: Duplicate prompt id "duplicate".']);
  });

  it('blocks copy for promptPaths and global validation issues', () => {
    const prompt = makePrompt('Hello {{ name }} from {{place}}.', 'duplicate', undefined, 'prompts/a.md');
    const result = composePrompt(prompt, { name: 'Ada', place: 'London' }, {}, {
      validationIssues: [
        { scope: 'prompt', path: 'prompts/b.md', promptPaths: ['prompts/a.md', 'prompts/b.md'], message: 'Duplicate prompt id "duplicate".' },
        { scope: 'global', message: 'Library validation failed.' }
      ]
    });

    expect(result.canCopy).toBe(false);
    expect(result.validationBlockers).toEqual([
      'prompts/b.md: Duplicate prompt id "duplicate".',
      'Library validation failed.'
    ]);
  });

  it('falls back to path matching when qualified keys are empty', () => {
    const prompt = makePrompt('Hello {{ name }} from {{place}}.', 'a', undefined, 'prompts/a.md');
    const result = composePrompt(prompt, { name: 'Ada', place: 'London' }, {}, {
      validationIssues: [{ scope: 'prompt', path: 'prompts/a.md', promptKey: '', promptKeys: [''], message: 'Duplicate prompt id "a".' }]
    });

    expect(result.canCopy).toBe(false);
    expect(result.validationBlockers).toEqual(['prompts/a.md: Duplicate prompt id "a".']);
  });

  it('only blocks preset validation issues for prompts that use model placeholders', () => {
    const presetIssue = { scope: 'preset' as const, path: 'model-presets.yaml', message: 'Duplicate model preset id "gpt".' };

    expect(composePrompt(makePrompt('Hello {{name}} from {{place}}.'), { name: 'Ada', place: 'London' }, {}, { validationIssues: [presetIssue] }).canCopy).toBe(true);
    expect(composePrompt(makePrompt('Use {{model}} for {{name}}.'), { name: 'Ada', place: 'London' }, { model: 'GPT' }, { validationIssues: [presetIssue] }).canCopy).toBe(false);
    expect(composePrompt(makePrompt('Use {{rubberDuckModel}} for {{name}}.'), { name: 'Ada', place: 'London' }, { rubberDuckModel: 'GPT' }, { validationIssues: [presetIssue] }).canCopy).toBe(false);
  });

  it('only blocks invalid default model issues for prompts that use model placeholders', () => {
    const defaultModelIssue = { scope: 'prompt' as const, path: 'prompt.md', message: 'Default model preset "missing-model" does not exist.' };

    expect(composePrompt(makePrompt('Hello {{name}} from {{place}}.'), { name: 'Ada', place: 'London' }, {}, { validationIssues: [defaultModelIssue] }).canCopy).toBe(true);
    expect(composePrompt(makePrompt('Use {{model}} for {{name}}.'), { name: 'Ada', place: 'London' }, { model: 'GPT' }, { validationIssues: [defaultModelIssue] }).canCopy).toBe(false);
    expect(composePrompt(makePrompt('Use {{rubberDuckModel}} for {{name}}.'), { name: 'Ada', place: 'London' }, { rubberDuckModel: 'GPT' }, { validationIssues: [defaultModelIssue] }).canCopy).toBe(false);
  });

  it('seeds variable defaults', () => {
    expect(initialVariableValues([{ name: 'tone', label: 'Tone', required: false, defaultValue: 'concise' }])).toEqual({ tone: 'concise' });
  });

  it('seeds option defaults', () => {
    expect(initialOptionValues([
      { id: 'frontendFocus', label: 'Frontend', defaultEnabled: true },
      { id: 'backendFocus', label: 'Backend', defaultEnabled: false }
    ])).toEqual({ frontendFocus: true, backendFocus: false });
  });

  it('includes enabled option blocks and omits disabled option blocks', () => {
    const prompt = makePromptWithOptions(
      'Start.\n{{#option frontendFocus}}\nFrontend {{name}}.\n{{/option}}\n{{#option backendFocus}}\nBackend {{place}}.\n{{/option}}\nEnd.'
    );
    const result = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: true, backendFocus: false } });

    expect(result.text).toBe('Start.\nFrontend UI.\nEnd.');
    expect(result.canCopy).toBe(true);
  });

  it('renders stacked option blocks as a tight list without injecting blank lines, on LF and CRLF', () => {
    // Blocks stacked with no blank lines between them, and a blank line before and after the list.
    const source = 'Have them focus on:\n\n{{#option frontendFocus}}\n- Frontend {{name}}.\n{{/option}}\n{{#option backendFocus}}\n- Backend {{place}}.\n{{/option}}\n\nPresent findings.';

    for (const template of [source, source.replace(/\n/g, '\r\n')]) {
      const prompt = makePromptWithOptions(template);

      const bothEnabled = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: true, backendFocus: true } });
      expect(bothEnabled.text).toBe('Have them focus on:\n\n- Frontend UI.\n- Backend API.\n\nPresent findings.');
      expect(bothEnabled.text).not.toContain('\r');

      const backendOnly = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: false, backendFocus: true } });
      expect(backendOnly.text).toBe('Have them focus on:\n\n- Backend API.\n\nPresent findings.');

      const noneEnabled = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: false, backendFocus: false } });
      expect(noneEnabled.text).toBe('Have them focus on:\n\nPresent findings.');
    }
  });

  it('omits disabled blocks and keeps tight output when the template uses CRLF line endings', () => {
    const prompt = makePromptWithOptions(
      'Start.\n{{#option frontendFocus}}\nFrontend {{name}}.\n{{/option}}\n{{#option backendFocus}}\nBackend {{place}}.\n{{/option}}\nEnd.'.replace(/\n/g, '\r\n')
    );

    const bothEnabled = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: true, backendFocus: true } });
    expect(bothEnabled.text).toBe('Start.\nFrontend UI.\nBackend API.\nEnd.');
    expect(bothEnabled.text).not.toContain('\r');

    const backendOnly = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: false, backendFocus: true } });
    expect(backendOnly.text).toBe('Start.\nBackend API.\nEnd.');
  });

  it('normalizes a whitespace-only separator line to a clean blank line and collapses leftover gaps under CRLF', () => {
    // The separator line between the option blocks holds only a space and a tab, and the whole template uses CRLF.
    const template = [
      'Focus on:',
      '',
      '{{#option frontendFocus}}',
      '- Frontend {{name}}.',
      '{{/option}}',
      ' \t ',
      '{{#option backendFocus}}',
      '- Backend {{place}}.',
      '{{/option}}'
    ].join('\r\n');
    const prompt = makePromptWithOptions(template);

    const backendOnly = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: false, backendFocus: true } });
    expect(backendOnly.text).toBe('Focus on:\n\n- Backend API.');
    expect(backendOnly.text).not.toMatch(/\n[ \t]+\n/);

    const bothEnabled = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: true, backendFocus: true } });
    expect(bothEnabled.text).toBe('Focus on:\n\n- Frontend UI.\n\n- Backend API.');
    expect(bothEnabled.text).not.toMatch(/\n[ \t]+\n/);
  });

  it('renders three stacked options with a standalone all-off fallback cleanly, on LF and CRLF', () => {
    const source = [
      'Have them focus on:',
      '',
      '{{#option frontendFocus}}',
      '- Frontend {{name}}.',
      '{{/option}}',
      '{{#option backendFocus}}',
      '- Backend {{place}}.',
      '{{/option}}',
      '{{#option crossTopicConcerns}}',
      '- Cross-topic concerns.',
      '{{/option}}',
      '{{#allOptionsDisabled}}',
      '- A concise general review of {{name}}.',
      '{{/allOptionsDisabled}}',
      '',
      'Present findings.'
    ].join('\n');
    const options = [
      { id: 'frontendFocus', label: 'Frontend', defaultEnabled: true },
      { id: 'backendFocus', label: 'Backend', defaultEnabled: true },
      { id: 'crossTopicConcerns', label: 'Cross-topic', defaultEnabled: true }
    ];

    for (const template of [source, source.replace(/\n/g, '\r\n')]) {
      const prompt = makePromptWithOptions(template, options);

      const allOn = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: true, backendFocus: true, crossTopicConcerns: true } });
      expect(allOn.text).toBe('Have them focus on:\n\n- Frontend UI.\n- Backend API.\n- Cross-topic concerns.\n\nPresent findings.');
      expect(allOn.text).not.toContain('\r');
      expect(allOn.text).not.toMatch(/\n[ \t*]*\n\n/);

      const oneOn = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: false, backendFocus: true, crossTopicConcerns: false } });
      expect(oneOn.text).toBe('Have them focus on:\n\n- Backend API.\n\nPresent findings.');

      const noneOn = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: false, backendFocus: false, crossTopicConcerns: false } });
      expect(noneOn.text).toBe('Have them focus on:\n\n- A concise general review of UI.\n\nPresent findings.');
    }
  });

  it('does not require variables that are only used inside disabled option blocks', () => {
    const prompt = makePromptWithOptions(
      'Start.\n{{#option frontendFocus}}\nFrontend {{name}}.\n{{/option}}\n{{#option backendFocus}}\nBackend {{place}}.\n{{/option}}'
    );
    const result = composePrompt(prompt, { name: 'UI', place: '' }, {}, { optionValues: { frontendFocus: true, backendFocus: false } });

    expect(result.canCopy).toBe(true);
    expect(result.activeVariableNames).toEqual(['name']);
    expect(result.missingRequired).toEqual([]);
  });

  it('requires variables that are used inside enabled option blocks', () => {
    const prompt = makePromptWithOptions('{{#option backendFocus}}Backend {{place}}.{{/option}}');
    const result = composePrompt(prompt, { name: 'UI', place: '' }, {}, { optionValues: { backendFocus: true } });

    expect(result.canCopy).toBe(false);
    expect(result.missingRequired).toEqual(['place']);
  });

  it('does not require model built-ins that are only used inside disabled option blocks', () => {
    const prompt = makePromptWithOptions('{{#option frontendFocus}}Use {{model}} for {{name}}.{{/option}}\nAlways {{place}}.');
    const result = composePrompt(prompt, { name: 'UI', place: 'repo' }, {}, { optionValues: { frontendFocus: false } });

    expect(result.canCopy).toBe(true);
    expect(result.usesModelPlaceholder).toBe(false);
    expect(result.missingBuiltIns).toEqual([]);
  });

  it('requires model built-ins that are used inside enabled option blocks', () => {
    const prompt = makePromptWithOptions('{{#option frontendFocus}}Use {{model}} for {{name}}.{{/option}}');
    const result = composePrompt(prompt, { name: 'UI', place: 'repo' }, {}, { optionValues: { frontendFocus: true } });

    expect(result.canCopy).toBe(false);
    expect(result.usesModelPlaceholder).toBe(true);
    expect(result.missingBuiltIns).toEqual(['model']);
  });

  it('uses prompt-specific fallback when all options are disabled', () => {
    const prompt = makePromptWithOptions(
      '{{#option frontendFocus}}Frontend {{name}}.{{/option}}\n{{#option backendFocus}}Backend {{place}}.{{/option}}\n{{#allOptionsDisabled}}General {{name}} in {{place}}.{{/allOptionsDisabled}}'
    );
    const result = composePrompt(prompt, { name: 'work', place: 'repo' }, {}, { optionValues: { frontendFocus: false, backendFocus: false } });

    expect(result.text).toBe('General work in repo.');
    expect(result.activeVariableNames).toEqual(['name', 'place']);
    expect(result.canCopy).toBe(true);
  });

  it('renders one value condition and keeps a condition-only control active beside checkbox options', () => {
    const prompt = makePromptWithControls(
      [
        'Plan {{name}}.',
        '{{#when executionTarget currentSession}}Run approved waves here.{{/when}}',
        '{{#when executionTarget independentSessions}}Run approved waves in independent sessions.{{/when}}',
        '{{#option frontendFocus}}Include frontend concerns.{{/option}}',
        '{{#allOptionsDisabled}}No additive focus.{{/allOptionsDisabled}}'
      ].join('\n'),
      [
        {
          name: 'executionTarget',
          label: 'Execution target',
          required: true,
          control: 'select',
          defaultValue: 'currentSession',
          choices: [
            { id: 'currentSession', label: 'Current session' },
            { id: 'independentSessions', label: 'Independent sessions' }
          ]
        }
      ],
      [{ id: 'frontendFocus', label: 'Frontend', defaultEnabled: true }]
    );

    const result = composePrompt(
      prompt,
      { name: 'the change', place: 'repo', executionTarget: 'independentSessions' },
      {},
      { optionValues: { frontendFocus: false } }
    );

    expect(result.text).toContain('Run approved waves in independent sessions.');
    expect(result.text).not.toContain('Run approved waves here.');
    expect(result.activeVariableNames).toContain('executionTarget');
    expect(result.activeVariableNames).toContain('name');
    expect(result.canCopy).toBe(true);
  });

  it('interpolates typed choices using their prompt value or label instead of the raw id', () => {
    const prompt = makePromptWithControls(
      'Execute with {{executionTarget}} at {{analysisDepth}}.',
      [
        {
          name: 'executionTarget',
          label: 'Execution target',
          required: true,
          control: 'select',
          defaultValue: 'independentSessions',
          choices: [
            { id: 'currentSession', label: 'Current session' },
            { id: 'independentSessions', label: 'Independent sessions', value: 'separate Copilot CLI sessions' }
          ]
        },
        {
          name: 'analysisDepth',
          label: 'Analysis depth',
          required: true,
          control: 'slider',
          defaultValue: 'focused',
          choices: [
            { id: 'brief', label: 'Brief' },
            { id: 'focused', label: 'Focused' },
            { id: 'exhaustive', label: 'Exhaustive' }
          ]
        }
      ]
    );

    const result = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      executionTarget: 'independentSessions',
      analysisDepth: 'focused'
    });

    expect(result.text).toBe('Execute with separate Copilot CLI sessions at Focused.');
    expect(result.text).not.toContain('independentSessions');
  });

  it('does not require inputs or models that exist only inside an inactive value condition', () => {
    const prompt = makePromptWithControls(
      [
        '{{#when delivery conversation}}Answer inline.{{/when}}',
        '{{#when delivery report}}Use {{model}} to write {{place}}.{{/when}}'
      ].join('\n'),
      [
        {
          name: 'delivery',
          label: 'Delivery',
          required: true,
          control: 'select',
          defaultValue: 'conversation',
          choices: [
            { id: 'conversation', label: 'Conversation' },
            { id: 'report', label: 'Report' }
          ]
        }
      ]
    );

    const result = composePrompt(prompt, { name: '', place: '', delivery: 'conversation' });

    expect(result.text).toBe('Answer inline.');
    expect(result.activeVariableNames).toEqual(['delivery']);
    expect(result.missingRequired).toEqual([]);
    expect(result.missingBuiltIns).toEqual([]);
    expect(result.canCopy).toBe(true);
    expect(promptUsesModelPlaceholder(prompt)).toBe(false);
  });

  it('renders standalone value-condition blocks consistently under LF and CRLF', () => {
    const source = [
      'Delivery:',
      '',
      '{{#when delivery conversation}}',
      '- Answer inline.',
      '{{/when}}',
      '{{#when delivery report}}',
      '- Create a report.',
      '{{/when}}',
      '',
      'Stop.'
    ].join('\n');

    for (const template of [source, source.replace(/\n/g, '\r\n')]) {
      const prompt = makePromptWithControls(template, [
        {
          name: 'delivery',
          label: 'Delivery',
          required: true,
          control: 'select',
          defaultValue: 'conversation',
          choices: [
            { id: 'conversation', label: 'Conversation' },
            { id: 'report', label: 'Report' }
          ]
        }
      ]);
      const result = composePrompt(prompt, { name: 'work', place: 'repo', delivery: 'report' });

      expect(result.text).toBe('Delivery:\n\n- Create a report.\n\nStop.');
      expect(result.text).not.toContain('\r');
    }
  });

  it('renders compound conditions as AND and repeated blocks as OR', () => {
    const prompt = makePromptWithControls(
      [
        '{{#when purpose technicalDesign technicalScope frontend}}Frontend design.{{/when}}',
        '{{#when purpose technicalDesign technicalScope backend}}Backend design.{{/when}}',
        '{{#when purpose technicalDesign technicalScope fullStack}}Full-stack design.{{/when}}'
      ].join('\n'),
      [
        selectVariable('purpose', 'general', ['general', 'technicalDesign']),
        selectVariable('technicalScope', 'frontend', ['frontend', 'backend', 'fullStack'])
      ]
    );

    const frontend = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      purpose: 'technicalDesign',
      technicalScope: 'frontend'
    });
    const backend = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      purpose: 'technicalDesign',
      technicalScope: 'backend'
    });
    const general = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      purpose: 'general',
      technicalScope: 'frontend'
    });

    expect(frontend.text).toBe('Frontend design.');
    expect(backend.text).toBe('Backend design.');
    expect(general.text).toBe('');
    expect(frontend.activeVariableNames).toEqual(['purpose', 'technicalScope']);
  });

  it('renders standalone compound tags cleanly on LF and CRLF', () => {
    const source = [
      'Guidance:',
      '',
      '{{#when purpose technicalDesign technicalScope backend}}',
      '- Backend design.',
      '{{/when}}',
      '{{#when purpose technicalDesign technicalScope frontend}}',
      '- Frontend design.',
      '{{/when}}',
      '',
      'Stop.'
    ].join('\n');

    for (const template of [source, source.replace(/\n/g, '\r\n')]) {
      const prompt = makePromptWithControls(template, [
        selectVariable('purpose', 'technicalDesign', ['general', 'technicalDesign']),
        selectVariable('technicalScope', 'backend', ['frontend', 'backend'])
      ]);
      const result = composePrompt(prompt, {
        name: 'work',
        place: 'repo',
        purpose: 'technicalDesign',
        technicalScope: 'backend'
      });

      expect(result.text).toBe('Guidance:\n\n- Backend design.\n\nStop.');
      expect(result.text).not.toContain('\r');
    }
  });

  it('suppresses compound branches and model requirements when a referenced control is hidden', () => {
    const prompt = makePromptWithControls(
      [
        'General guidance.',
        '{{#when purpose technicalDesign technicalScope backend}}Use {{model}} to write {{place}}.{{/when}}'
      ].join('\n'),
      [
        selectVariable('purpose', 'general', ['general', 'technicalDesign']),
        {
          ...selectVariable('technicalScope', 'backend', ['frontend', 'backend']),
          visibleWhen: { purpose: ['technicalDesign'] }
        }
      ]
    );
    const result = composePrompt(prompt, {
      name: '',
      place: '',
      purpose: 'general',
      technicalScope: 'backend'
    });

    expect(result.text).toBe('General guidance.');
    expect(result.activeVariableNames).toEqual(['purpose']);
    expect(result.missingBuiltIns).toEqual([]);
    expect(result.missingRequired).toEqual([]);
    expect(result.canCopy).toBe(true);
  });

  it.each(['select', 'slider'] as const)('suppresses conditions for visible disabled %s controls without clearing their value', (control) => {
    const prompt = makePromptWithControls(
      '{{#when technicalScope backend}}Use {{model}} for backend work.{{/when}}',
      [
        selectVariable('purpose', 'general', ['general', 'technicalDesign']),
        {
          name: 'technicalScope',
          label: 'Technical scope',
          required: true,
          control,
          defaultValue: 'backend',
          choices: [
            { id: 'frontend', label: 'frontend' },
            { id: 'backend', label: 'backend' }
          ],
          enabledWhen: { purpose: ['technicalDesign'] }
        }
      ]
    );
    const storedValues = {
      name: 'work',
      place: 'repo',
      purpose: 'general',
      technicalScope: 'backend'
    };

    const disabled = composePrompt(prompt, storedValues);
    const reenabled = composePrompt(prompt, { ...storedValues, purpose: 'technicalDesign' });

    expect(disabled.applicability.variables.technicalScope).toEqual({ visible: true, enabled: false });
    expect(disabled.text).toBe('');
    expect(disabled.usesModelPlaceholder).toBe(false);
    expect(disabled.missingBuiltIns).toEqual([]);
    expect(reenabled.text).toBe('Use {{model}} for backend work.');
    expect(reenabled.usesModelPlaceholder).toBe(true);
    expect(reenabled.missingBuiltIns).toEqual(['model']);
  });

  it('does not require hidden or disabled variables and removes their direct placeholder values', () => {
    const prompt = makePromptWithControls(
      'Scope {{technicalScope}}. Hidden {{hiddenNotes}}. Disabled {{technicalNotes}}.',
      [
        selectVariable('purpose', 'general', ['general', 'technicalDesign']),
        {
          ...selectVariable('technicalScope', 'backend', ['frontend', 'backend']),
          visibleWhen: { purpose: ['technicalDesign'] }
        },
        {
          name: 'hiddenNotes',
          label: 'Hidden notes',
          required: true,
          visibleWhen: { purpose: ['technicalDesign'] }
        },
        {
          name: 'technicalNotes',
          label: 'Technical notes',
          required: true,
          enabledWhen: { purpose: ['technicalDesign'] }
        }
      ]
    );
    const result = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      purpose: 'general',
      technicalScope: 'backend',
      hiddenNotes: '',
      technicalNotes: ''
    });

    expect(result.text).toBe('Scope . Hidden . Disabled .');
    expect(result.activeVariableNames).toEqual(['purpose']);
    expect(result.missingRequired).toEqual([]);
    expect(result.canCopy).toBe(true);
  });

  it('normalizes hidden and disabled options to false without restoring stale state', () => {
    const prompt = makePromptWithControls(
      [
        '{{#option uiMockups}}Create UI mockups.{{/option}}',
        '{{#allOptionsDisabled}}No available artifact is selected.{{/allOptionsDisabled}}'
      ].join('\n'),
      [
        selectVariable('purpose', 'technicalDesign', ['general', 'technicalDesign']),
        selectVariable('technicalScope', 'frontend', ['frontend', 'backend'])
      ],
      [{
        id: 'uiMockups',
        label: 'UI mockups',
        defaultEnabled: true,
        visibleWhen: { purpose: ['technicalDesign'] },
        enabledWhen: { technicalScope: ['frontend'] }
      }]
    );
    const common = { name: 'work', place: 'repo', purpose: 'technicalDesign' };

    const disabled = composePrompt(prompt, { ...common, technicalScope: 'backend' }, {}, {
      optionValues: { uiMockups: true }
    });
    const cleared = normalizeOptionValues(prompt, { ...common, technicalScope: 'backend' }, { uiMockups: true });
    const reenabled = normalizeOptionValues(prompt, { ...common, technicalScope: 'frontend' }, cleared);

    expect(disabled.text).toBe('No available artifact is selected.');
    expect(disabled.applicability.options.uiMockups).toEqual({ visible: true, enabled: false });
    expect(disabled.effectiveOptionValues.uiMockups).toBe(false);
    expect(cleared.uiMockups).toBe(false);
    expect(reenabled.uiMockups).toBe(false);
  });

  it('applies visibility before enabled predicates and keeps applicability-only controls active', () => {
    const prompt = makePromptWithControls(
      [
        '{{#option uiMockups}}Create UI mockups.{{/option}}',
        '{{#allOptionsDisabled}}No available artifact is selected.{{/allOptionsDisabled}}'
      ].join('\n'),
      [
        selectVariable('purpose', 'general', ['general', 'technicalDesign']),
        selectVariable('technicalScope', 'backend', ['frontend', 'backend'])
      ],
      [{
        id: 'uiMockups',
        label: 'UI mockups',
        defaultEnabled: true,
        visibleWhen: { purpose: ['technicalDesign'] },
        enabledWhen: { technicalScope: ['frontend'] }
      }]
    );

    const hidden = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      purpose: 'general',
      technicalScope: 'frontend'
    });
    const disabled = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      purpose: 'technicalDesign',
      technicalScope: 'backend'
    });

    expect(hidden.applicability.options.uiMockups).toEqual({ visible: false, enabled: false });
    expect(hidden.text).toBe('');
    expect(hidden.activeVariableNames).toEqual(['purpose', 'technicalScope']);
    expect(disabled.applicability.options.uiMockups).toEqual({ visible: true, enabled: false });
    expect(disabled.text).toBe('No available artifact is selected.');
  });

  it('computes allOptionsDisabled from the non-empty set of visible options only', () => {
    const prompt = makePromptWithControls(
      [
        '{{#option visibleArtifact}}Visible artifact.{{/option}}',
        '{{#option hiddenArtifact}}Hidden artifact.{{/option}}',
        '{{#allOptionsDisabled}}Visible fallback.{{/allOptionsDisabled}}'
      ].join('\n'),
      [selectVariable('purpose', 'technicalDesign', ['general', 'technicalDesign'])],
      [
        {
          id: 'visibleArtifact',
          label: 'Visible artifact',
          defaultEnabled: false,
          visibleWhen: { purpose: ['technicalDesign'] }
        },
        {
          id: 'hiddenArtifact',
          label: 'Hidden artifact',
          defaultEnabled: true,
          visibleWhen: { purpose: ['general'] }
        }
      ]
    );

    const oneVisibleOff = composePrompt(prompt, {
      name: 'work',
      place: 'repo',
      purpose: 'technicalDesign'
    });
    const noneVisiblePrompt = {
      ...prompt,
      options: prompt.options.map((option) => ({ ...option, visibleWhen: { purpose: ['technicalDesign'] } }))
    };
    const noneVisible = composePrompt(noneVisiblePrompt, {
      name: 'work',
      place: 'repo',
      purpose: 'general'
    });

    expect(oneVisibleOff.text).toBe('Visible fallback.');
    expect(oneVisibleOff.effectiveOptionValues.hiddenArtifact).toBe(false);
    expect(noneVisible.text).toBe('');
  });

  it('renders compound condition helpers with hidden-control suppression', () => {
    const template = [
      '{{#when purpose technicalDesign technicalScope backend}}Backend.{{/when}}',
      '{{#when purpose technicalDesign technicalScope frontend}}Frontend.{{/when}}'
    ].join('\n');
    const values = { purpose: 'technicalDesign', technicalScope: 'backend' };

    expect(extractConditionVariableNames(template)).toEqual(['purpose', 'technicalScope']);
    expect(renderPromptTemplateConditions(template, values)).toBe('Backend.');
    expect(renderPromptTemplateConditions(template, values, new Set(['technicalScope']))).toBe('');
    expect(renderPromptTemplateControls(template, {}, false, values)).toBe('Backend.');
    expect(renderPromptTemplateControls(template, {}, false, values, new Set(['technicalScope']))).toBe('');
  });

  it('detects model placeholder usage from default-enabled option blocks only', () => {
    expect(promptUsesModelPlaceholder(makePromptWithOptions('{{#option frontendFocus}}Use {{model}}.{{/option}}'))).toBe(true);
    expect(promptUsesModelPlaceholder(makePromptWithOptions('{{#option backendFocus}}Use {{model}}.{{/option}}', [
      { id: 'backendFocus', label: 'Backend', defaultEnabled: false }
    ]))).toBe(false);
    expect(promptUsesRubberDuckModelPlaceholder(makePromptWithOptions('{{#allOptionsDisabled}}Use {{rubberDuckModel}}.{{/allOptionsDisabled}}'))).toBe(false);
  });
});

describe('prompt UI helpers', () => {
  it('formats singular and plural counts', () => {
    expect(formatCount(0, 'variable')).toBe('0 variables');
    expect(formatCount(1, 'variable')).toBe('1 variable');
    expect(formatCount(2, 'variable')).toBe('2 variables');
    expect(formatCount(1, 'input')).toBe('1 input');
  });

  it('chooses input controls from stable variable metadata', () => {
    expect(shouldUseTextarea({ name: 'title', label: 'Title', required: true, defaultValue: 'Short value' })).toBe(false);
    expect(shouldUseTextarea({ name: 'context', label: 'Context', required: false, defaultValue: 'Short value' })).toBe(true);
    expect(shouldUseTextarea({ name: 'notes', label: 'Notes', required: false, defaultValue: 'Line one\nLine two' })).toBe(true);
    expect(shouldUseTextarea({ name: 'notes', label: 'Notes', required: false, defaultValue: 'x'.repeat(91) })).toBe(true);
    expect(shouldUseTextarea({ name: 'context', label: 'Context', required: false, control: 'text' })).toBe(false);
    expect(shouldUseTextarea({ name: 'title', label: 'Title', required: false, control: 'textarea' })).toBe(true);
  });
});

describe('prompt validation', () => {
  it('detects unknown placeholders and empty templates with file paths', () => {
    const result = parsePromptFile('prompts/example.md', '---\nid: example\ntitle: Example\nvariables: [known]\n---\n{{missing}}');

    expect(result.issues).toContainEqual(
      expect.objectContaining({ scope: 'prompt', path: 'prompts/example.md', message: 'Unknown placeholder "missing" is not declared as a variable.' })
    );
  });

  it('normalizes CRLF line endings so the stored template is canonical LF', () => {
    const raw = ['---', 'id: example', 'title: Example', 'description: Example prompt', 'category: planning', '---', 'Line one.', '', 'Line two.'].join('\r\n');
    const result = parsePromptFile('prompts/example.md', raw);

    expect(result.issues).toEqual([]);
    expect(result.prompt?.template).toBe('Line one.\n\nLine two.');
    expect(result.prompt?.template.includes('\r')).toBe(false);
  });

  it('detects duplicate variable names', () => {
    const result = parsePromptFile('prompts/example.md', '---\nid: example\ntitle: Example\nvariables:\n  - name: topic\n  - name: topic\n---\n{{topic}}');

    expect(result.issues.some((issue) => issue.message.includes('Duplicate variable name "topic"'))).toBe(true);
  });

  it('parses model_default and allows built-in model placeholders', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: review\nmodel_default: gpt-5-5\nvariables:\n  - name: topic\n---\nUse {{model}} for {{topic}} and {{rubberDuckModel}} for critique.'
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.defaultModelId).toBe('gpt-5-5');
  });

  it('parses prompt-specific model roles as presentation-only metadata', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'model_roles:',
        '  model:',
        '    label: Approved execution model',
        '    description: Used by approved implementation workers.',
        '  rubberDuckModel:',
        '    label: Planning and review model',
        '    description: Used to critique the plan and review execution waves.',
        '---',
        'Use {{model}} and {{rubberDuckModel}}.'
      ].join('\n')
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.modelRoles).toEqual({
      model: {
        label: 'Approved execution model',
        description: 'Used by approved implementation workers.'
      },
      rubberDuckModel: {
        label: 'Planning and review model',
        description: 'Used to critique the plan and review execution waves.'
      }
    });
    expect(composePrompt(
      { ...result.prompt!, source: 'builtin', sourceLabel: 'Built in', key: 'example' },
      {},
      { model: 'Execution', rubberDuckModel: 'Review' }
    ).text).toBe('Use Execution and Review.');
  });

  it('rejects unsupported model role keys and incomplete metadata', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'model_roles:',
        '  otherModel:',
        '    label: Other',
        '    description: Used elsewhere.',
        '  model:',
        '    label: Execution',
        '---',
        'Use {{model}}.'
      ].join('\n')
    );

    expect(result.issues.some((issue) => issue.message.includes('Unknown model role "otherModel"'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Model role "model" requires a non-empty description'))).toBe(true);
  });

  it('parses command prompt kind', () => {
    const result = parsePromptFile(
      'prompts/cli/example.md',
      '---\nid: example-command\ntitle: Example command\ndescription: Example command snippet\ncategory: cli\nkind: command\nvariables:\n  - name: path\n---\ncd {{path}}'
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.kind).toBe('command');
  });

  it.each([
    ['{{bad-name}}'],
    ['{{foo.bar}}'],
    ['{{ 123 }}'],
    ['{{ }}'],
    ['{{{foo}}'],
    ['{{foo}}}'],
    ['{{foo']
  ])('detects malformed placeholder syntax %s', (placeholder) => {
    const result = parsePromptFile(
      'prompts/example.md',
      `---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: review\n---\nBroken ${placeholder}`
    );

    expect(result.issues.some((issue) => issue.message.includes('placeholder'))).toBe(true);
    expect(result.prompt).toBeUndefined();
  });

  it('allows valid placeholders with optional spaces and model built-ins', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: review\nvariables:\n  - name: variableName\n---\nUse {{variableName}}, {{ variableName }}, {{model}}, and {{rubberDuckModel}}.'
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.template).toContain('{{ variableName }}');
  });

  it('parses options and allows option and all-off fallback blocks', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: topic',
        'options:',
        '  - id: frontendFocus',
        '    label: Frontend implementation guidance',
        '    description: Include frontend planning constraints.',
        '---',
        '{{#option frontendFocus}}',
        'Plan {{topic}} with {{model}}.',
        '{{/option}}',
        '{{#allOptionsDisabled}}',
        'Plan {{topic}} generally.',
        '{{/allOptionsDisabled}}'
      ].join('\n')
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.options).toEqual([
      {
        id: 'frontendFocus',
        label: 'Frontend implementation guidance',
        description: 'Include frontend planning constraints.',
        defaultEnabled: true
      }
    ]);
  });

  it('parses explicitly disabled option defaults', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'options:',
        '  - id: frontendFocus',
        '    default: false',
        '  - id: backendFocus',
        '    defaultEnabled: false',
        '---',
        '{{#option frontendFocus}}Frontend{{/option}}',
        '{{#option backendFocus}}Backend{{/option}}',
        '{{#allOptionsDisabled}}Fallback{{/allOptionsDisabled}}'
      ].join('\n')
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.options.map((option) => [option.id, option.defaultEnabled])).toEqual([
      ['frontendFocus', false],
      ['backendFocus', false]
    ]);
  });

  it('parses select and slider controls with ordered choices and defaults', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: executionTarget',
        '    label: Approved execution',
        '    control: select',
        '    default: nativeSubagents',
        '    choices:',
        '      - id: currentSession',
        '        label: Current session',
        '      - id: nativeSubagents',
        '        label: Native subagents',
        '      - id: independentSessions',
        '        label: Independent sessions',
        '        value: separate Copilot sessions',
        '  - name: depth',
        '    control: slider',
        '    default: focused',
        '    choices:',
        '      - id: brief',
        '        label: Brief',
        '      - id: focused',
        '        label: Focused',
        '---',
        '{{#when executionTarget independentSessions}}Use {{executionTarget}}.{{/when}}',
        '{{#when depth focused}}Investigate at {{depth}} depth.{{/when}}'
      ].join('\n')
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.variables[0]).toEqual(expect.objectContaining({
      name: 'executionTarget',
      control: 'select',
      defaultValue: 'nativeSubagents',
      choices: expect.arrayContaining([
        expect.objectContaining({ id: 'independentSessions', value: 'separate Copilot sessions' })
      ])
    }));
    expect(result.prompt?.variables[1]).toEqual(expect.objectContaining({
      control: 'slider',
      defaultValue: 'focused'
    }));
  });

  it('normalizes variable and option visibility and enabled predicates', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: purpose',
        '    control: select',
        '    default: general',
        '    choices:',
        '      - id: general',
        '      - id: technicalDesign',
        '  - name: technicalScope',
        '    control: select',
        '    default: frontend',
        '    choices:',
        '      - id: frontend',
        '      - id: backend',
        '    visible_when:',
        '      purpose: [technicalDesign]',
        '    enabled_when:',
        '      purpose: [technicalDesign]',
        'options:',
        '  - id: uiMockups',
        '    visible_when:',
        '      purpose: [technicalDesign]',
        '    enabled_when:',
        '      technicalScope: [frontend]',
        '---',
        '{{#when purpose technicalDesign technicalScope frontend}}Frontend.{{/when}}',
        '{{#option uiMockups}}Mockups.{{/option}}',
        '{{#allOptionsDisabled}}Fallback.{{/allOptionsDisabled}}'
      ].join('\n')
    );

    expect(result.issues).toEqual([]);
    expect(result.prompt?.variables[1]).toEqual(expect.objectContaining({
      visibleWhen: { purpose: ['technicalDesign'] },
      enabledWhen: { purpose: ['technicalDesign'] }
    }));
    expect(result.prompt?.options[0]).toEqual(expect.objectContaining({
      visibleWhen: { purpose: ['technicalDesign'] },
      enabledWhen: { technicalScope: ['frontend'] }
    }));
  });

  it('validates typed-control choices, defaults, and condition references', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: executionTarget',
        '    control: select',
        '    default: missing',
        '    choices:',
        '      - id: currentSession',
        '      - id: currentSession',
        '  - name: context',
        '---',
        '{{#when executionTarget unknown}}Unknown choice.{{/when}}',
        '{{#when context currentSession}}Invalid control.{{/when}}',
        '{{#when undeclared currentSession}}Unknown variable.{{/when}}'
      ].join('\n')
    );

    expect(result.issues.some((issue) => issue.message.includes('duplicate choice id "currentSession"'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('sets default "missing" that is not one of its choices'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Unknown choice "unknown"'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Condition variable "context" must use control'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Unknown condition variable "undeclared"'))).toBe(true);
  });

  it('validates every pair in a compound condition and rejects incomplete pairs', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: purpose',
        '    control: select',
        '    default: general',
        '    choices:',
        '      - id: general',
        '      - id: technicalDesign',
        '  - name: scope',
        '    control: select',
        '    default: frontend',
        '    choices:',
        '      - id: frontend',
        '      - id: backend',
        '---',
        '{{#when purpose technicalDesign scope missing}}Unknown pair choice.{{/when}}',
        '{{#when purpose technicalDesign scope}}Incomplete pair.{{/when}}'
      ].join('\n')
    );

    expect(result.issues.some((issue) => issue.message.includes('Unknown choice "missing" for condition variable "scope"'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('complete variable-choice pairs'))).toBe(true);
  });

  it('rejects condition directive prefix lookalikes', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: purpose',
        '    control: select',
        '    default: general',
        '    choices:',
        '      - id: general',
        '      - id: technicalDesign',
        '---',
        '{{#whenever purpose general}}Invalid prefix.{{/when}}'
      ].join('\n')
    );

    expect(result.issues.some((issue) =>
      issue.message.includes('Invalid condition block syntax "{{#whenever purpose general}}"')
    )).toBe(true);
  });

  it('reports actionable applicability reference, control, and choice errors', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: purpose',
        '    control: select',
        '    default: general',
        '    choices:',
        '      - id: general',
        '      - id: technicalDesign',
        '  - name: context',
        '  - name: scoped',
        '    visible_when:',
        '      missing: [general]',
        '    enabled_when:',
        '      context: [general]',
        'options:',
        '  - id: artifact',
        '    visible_when:',
        '      purpose: [missingChoice]',
        '---',
        '{{#option artifact}}Artifact.{{/option}}',
        '{{#allOptionsDisabled}}Fallback.{{/allOptionsDisabled}}'
      ].join('\n')
    );

    expect(result.issues.some((issue) => issue.message.includes('Variable "scoped" visible_when references unknown variable "missing"'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Variable "scoped" enabled_when references variable "context", which must use control'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Option "artifact" visible_when references unknown choice "missingChoice" for variable "purpose"'))).toBe(true);
  });

  it('rejects self-referential and cyclic applicability', () => {
    const self = parsePromptFile(
      'prompts/self.md',
      [
        '---',
        'id: self',
        'title: Self',
        'description: Self reference',
        'category: planning',
        'variables:',
        '  - name: purpose',
        '    control: select',
        '    default: general',
        '    choices:',
        '      - id: general',
        '      - id: technicalDesign',
        '    visible_when:',
        '      purpose: [technicalDesign]',
        '---',
        'Self.'
      ].join('\n')
    );
    const cycle = parsePromptFile(
      'prompts/cycle.md',
      [
        '---',
        'id: cycle',
        'title: Cycle',
        'description: Cyclic reference',
        'category: planning',
        'variables:',
        '  - name: purpose',
        '    control: select',
        '    default: general',
        '    choices:',
        '      - id: general',
        '      - id: technicalDesign',
        '    visible_when:',
        '      scope: [frontend]',
        '  - name: scope',
        '    control: select',
        '    default: frontend',
        '    choices:',
        '      - id: frontend',
        '      - id: backend',
        '    enabled_when:',
        '      purpose: [technicalDesign]',
        '---',
        'Cycle.'
      ].join('\n')
    );

    expect(self.issues.some((issue) => issue.message.includes('Variable "purpose" visible_when cannot reference itself'))).toBe(true);
    expect(cycle.issues.some((issue) => issue.message.includes('Applicability cycle detected: "purpose" -> "scope" -> "purpose"'))).toBe(true);
  });

  it('requires typed controls to declare a valid default and at least two choices', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'variables:',
        '  - name: delivery',
        '    control: select',
        '    choices:',
        '      - id: conversation',
        '---',
        '{{#when delivery conversation}}Inline.{{/when}}'
      ].join('\n')
    );

    expect(result.issues.some((issue) => issue.message.includes('must declare at least two choices'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('must declare a default choice'))).toBe(true);
  });

  it('rejects nested and malformed value-condition blocks while allowing sequential option and condition blocks', () => {
    const sequential = parsePromptFile(
      'prompts/sequential.md',
      [
        '---',
        'id: sequential',
        'title: Sequential',
        'description: Sequential blocks',
        'category: planning',
        'variables:',
        '  - name: delivery',
        '    control: select',
        '    default: conversation',
        '    choices:',
        '      - id: conversation',
        '      - id: report',
        'options:',
        '  - id: validation',
        '---',
        '{{#when delivery conversation}}Inline.{{/when}}',
        '{{#option validation}}Validate.{{/option}}',
        '{{#allOptionsDisabled}}No extra validation.{{/allOptionsDisabled}}'
      ].join('\n')
    );
    const nested = parsePromptFile(
      'prompts/nested.md',
      [
        '---',
        'id: nested',
        'title: Nested',
        'description: Nested blocks',
        'category: planning',
        'variables:',
        '  - name: delivery',
        '    control: select',
        '    default: conversation',
        '    choices:',
        '      - id: conversation',
        '      - id: report',
        '---',
        '{{#when delivery conversation}}{{#when delivery report}}Nested{{/when}}{{/when}}'
      ].join('\n')
    );
    const malformed = parsePromptFile(
      'prompts/malformed.md',
      '---\nid: malformed\ntitle: Malformed\ndescription: Malformed block\ncategory: planning\n---\n{{#when bad}}Broken{{/when}}'
    );

    expect(sequential.issues).toEqual([]);
    expect(nested.issues.some((issue) => issue.message.includes('Nested conditional blocks are not supported'))).toBe(true);
    expect(malformed.issues.some((issue) => issue.message.includes('Invalid condition block syntax'))).toBe(true);
  });

  it('parses standalone compound condition tags with LF and CRLF', () => {
    const source = [
      '---',
      'id: compound',
      'title: Compound',
      'description: Compound conditions',
      'category: planning',
      'variables:',
      '  - name: purpose',
      '    control: select',
      '    default: technicalDesign',
      '    choices:',
      '      - id: general',
      '      - id: technicalDesign',
      '  - name: scope',
      '    control: select',
      '    default: backend',
      '    choices:',
      '      - id: frontend',
      '      - id: backend',
      '---',
      '{{#when purpose technicalDesign scope backend}}',
      'Backend.',
      '{{/when}}'
    ].join('\n');

    for (const raw of [source, source.replace(/\n/g, '\r\n')]) {
      const result = parsePromptFile('prompts/compound.md', raw);
      expect(result.issues).toEqual([]);
      expect(result.prompt?.template).not.toContain('\r');
    }
  });

  it('validates option metadata and conditional block references', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'options:',
        '  - id: frontendFocus',
        '  - id: frontendFocus',
        '  - id: bad-id',
        '---',
        '{{#option backendFocus}}Backend{{/option}}'
      ].join('\n')
    );

    expect(result.issues.some((issue) => issue.message.includes('Duplicate option id "frontendFocus"'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Option id "bad-id"'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Unknown option block "backendFocus"'))).toBe(true);
  });

  it('requires declared options to affect output and provide all-off fallback text', () => {
    const missingOptionBlock = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'options:',
        '  - id: frontendFocus',
        '---',
        '{{#allOptionsDisabled}}Fallback{{/allOptionsDisabled}}'
      ].join('\n')
    );
    const missingFallback = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'options:',
        '  - id: frontendFocus',
        '---',
        '{{#option frontendFocus}}Frontend{{/option}}'
      ].join('\n')
    );

    expect(missingOptionBlock.issues.some((issue) => issue.message.includes('Option "frontendFocus" is declared but is not used'))).toBe(true);
    expect(missingFallback.issues.some((issue) => issue.message.includes('must include a {{#allOptionsDisabled}} fallback block'))).toBe(true);
  });

  it('rejects empty all-off fallback blocks', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      [
        '---',
        'id: example',
        'title: Example',
        'description: Example prompt',
        'category: planning',
        'options:',
        '  - id: frontendFocus',
        '---',
        '{{#option frontendFocus}}Frontend{{/option}}',
        '{{#allOptionsDisabled}}',
        '   ',
        '{{/allOptionsDisabled}}'
      ].join('\n')
    );

    expect(result.issues.some((issue) => issue.message.includes('fallback block must not be empty'))).toBe(true);
  });

  it('detects malformed option blocks', () => {
    const missingClose = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\noptions:\n  - id: frontendFocus\n---\n{{#option frontendFocus}}Frontend'
    );
    const strayClose = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\noptions:\n  - id: frontendFocus\n---\n{{/option}}'
    );
    const nested = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\noptions:\n  - id: frontendFocus\n  - id: backendFocus\n---\n{{#option frontendFocus}}{{#option backendFocus}}Nested{{/option}}{{/option}}'
    );

    expect(missingClose.issues.some((issue) => issue.message.includes('Unclosed option block'))).toBe(true);
    expect(strayClose.issues.some((issue) => issue.message.includes('Stray closing option block'))).toBe(true);
    expect(nested.issues.some((issue) => issue.message.includes('Nested option blocks are not supported'))).toBe(true);
  });

  it('detects malformed all-options-disabled blocks', () => {
    const zeroOptions = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\n---\n{{#allOptionsDisabled}}Fallback{{/allOptionsDisabled}}'
    );
    const missingClose = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\noptions:\n  - id: frontendFocus\n---\n{{#allOptionsDisabled}}Fallback'
    );
    const strayClose = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\noptions:\n  - id: frontendFocus\n---\n{{/allOptionsDisabled}}'
    );
    const mismatched = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\noptions:\n  - id: frontendFocus\n---\n{{#allOptionsDisabled}}Fallback{{/option}}'
    );

    expect(zeroOptions.issues.some((issue) => issue.message.includes('requires at least one declared option'))).toBe(true);
    expect(missingClose.issues.some((issue) => issue.message.includes('Unclosed all-options-disabled block'))).toBe(true);
    expect(strayClose.issues.some((issue) => issue.message.includes('Stray closing all-options-disabled block'))).toBe(true);
    expect(mismatched.issues.some((issue) => issue.message.includes('Mismatched closing tag "{{/option}}"'))).toBe(true);
  });

  it('requires declared variables inside option blocks', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      '---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: planning\noptions:\n  - id: frontendFocus\n---\n{{#option frontendFocus}}{{missing}}{{/option}}'
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'prompts/example.md', message: 'Unknown placeholder "missing" is not declared as a variable.' })
    );
  });

  it.each(['model', 'rubberDuckModel'])('rejects variables that use built-in placeholder name %s', (name) => {
    const result = parsePromptFile(
      'prompts/example.md',
      `---\nid: example\ntitle: Example\ndescription: Example prompt\ncategory: review\nvariables:\n  - name: ${name}\n---\nUse {{${name}}}.`
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'prompts/example.md', message: `Variable name "${name}" is reserved for a built-in placeholder.` })
    );
  });

  it('detects invalid prompt and variable identifiers', () => {
    const result = parsePromptFile(
      'prompts/example.md',
      '---\nid: Bad ID\ntitle: Example\ndescription: Example prompt\ncategory: review\nvariables:\n  - name: bad-name\n---\n{{bad}}'
    );

    expect(result.issues.some((issue) => issue.message.includes('Prompt id must be kebab-case'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Variable name "bad-name"'))).toBe(true);
  });

  it('detects duplicate prompt ids and invalid model defaults', () => {
    const promptA = makePrompt('A', 'same', 'missing-model', 'a.md');
    const promptB = makePrompt('B', 'same', undefined, 'b.md');
    const issues = validatePromptCollection([promptA, promptB], [{ id: 'gpt-5-5', label: 'GPT-5.5', contexts: [], reasoning: [] }]);

    expect(issues).toContainEqual(expect.objectContaining({ path: 'a.md', promptPaths: ['a.md', 'b.md'], message: 'Duplicate prompt id "same".' }));
    expect(issues).toContainEqual(expect.objectContaining({ path: 'b.md', promptPaths: ['a.md', 'b.md'], message: 'Duplicate prompt id "same".' }));
    expect(issues.some((issue) => issue.message.includes('Default model preset "missing-model"'))).toBe(true);
  });

  it('detects duplicate prompt ids when one duplicate has local validation issues', () => {
    const validResult = parsePromptFile(
      'prompts/valid.md',
      '---\nid: same\ntitle: Valid\ndescription: Valid prompt\ncategory: review\n---\nValid body.'
    );
    const invalidResult = parsePromptFile(
      'prompts/invalid.md',
      '---\nid: same\ntitle: Invalid\ndescription: Invalid prompt\ncategory: review\n---\nBroken {{bad-name}}.'
    );
    const prompts = [validResult.prompt, invalidResult.prompt].filter((prompt): prompt is Prompt => Boolean(prompt));
    const promptIdentities = [validResult.promptIdentity, invalidResult.promptIdentity].filter((identity): identity is PromptIdentity => Boolean(identity));
    const issues = validatePromptCollection(prompts, [], { promptIdentities });

    expect(invalidResult.prompt).toBeUndefined();
    expect(invalidResult.issues.some((issue) => issue.message.includes('Invalid placeholder syntax'))).toBe(true);
    expect(issues).toContainEqual(
      expect.objectContaining({ path: 'prompts/valid.md', promptPaths: ['prompts/valid.md', 'prompts/invalid.md'], message: 'Duplicate prompt id "same".' })
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: 'prompts/invalid.md', promptPaths: ['prompts/valid.md', 'prompts/invalid.md'], message: 'Duplicate prompt id "same".' })
    );
  });

  it('detects zero prompt Markdown files at collection level', () => {
    const issues = validatePromptCollection([], [], { promptFileCount: 0 });

    expect(issues).toContainEqual(expect.objectContaining({ scope: 'global', message: 'No prompt Markdown files were found.' }));
  });
});

describe('model preset validation', () => {
  it('detects duplicate preset ids', () => {
    const result = parseModelPresets('model-presets.yaml', 'presets:\n  - id: one\n  - id: one\n');

    expect(result.issues).toContainEqual(expect.objectContaining({ scope: 'preset', path: 'model-presets.yaml', message: 'Duplicate model preset id "one".' }));
  });

  it('parses context and reasoning variants with defaults', () => {
    const result = parseModelPresets(
      'model-presets.yaml',
      'presets:\n  - id: terra\n    label: GPT-5.6 Terra\n    contexts:\n      - id: standard\n        label: ""\n      - id: 1m\n        label: 1M context\n    default_reasoning: xhigh\n    reasoning:\n      - id: high\n        label: high reasoning\n      - id: xhigh\n        label: extra high reasoning\n'
    );

    expect(result.issues).toEqual([]);
    expect(result.presets[0].contexts.map((variant) => variant.id)).toEqual(['standard', '1m']);
    expect(result.presets[0].defaultContextId).toBe('standard');
    expect(result.presets[0].defaultReasoningId).toBe('xhigh');
  });

  it('keeps presets without variants usable', () => {
    const result = parseModelPresets('model-presets.yaml', 'presets:\n  - id: plain\n    label: Plain\n');

    expect(result.issues).toEqual([]);
    expect(result.presets[0].contexts).toEqual([]);
    expect(result.presets[0].defaultReasoningId).toBeUndefined();
  });

  it('reports a default that is not one of the declared variants', () => {
    const result = parseModelPresets(
      'model-presets.yaml',
      'presets:\n  - id: terra\n    default_reasoning: nope\n    reasoning:\n      - id: high\n        label: high reasoning\n'
    );

    expect(result.issues).toContainEqual(expect.objectContaining({ message: 'Model preset "terra" sets a default reasoning "nope" that is not one of its reasoning entries.' }));
  });

  it('rejects a variant id that is not kebab-case', () => {
    const result = parseModelPresets(
      'model-presets.yaml',
      'presets:\n  - id: terra\n    reasoning:\n      - id: Extra High\n        label: extra high reasoning\n'
    );

    expect(result.issues.some((issue) => issue.message.includes('reasoning id "Extra High"'))).toBe(true);
  });
});

describe('model label composition', () => {
  const preset = {
    id: 'terra',
    label: 'GPT-5.6 Terra',
    contexts: [{ id: 'standard', label: '' }, { id: '1m', label: '1M context' }],
    reasoning: [{ id: 'xhigh', label: 'extra high reasoning' }]
  };

  it('joins label, context, and reasoning', () => {
    expect(composeModelLabel(preset, '1m', 'xhigh')).toBe('GPT-5.6 Terra 1M context extra high reasoning');
  });

  it('omits an empty context label', () => {
    expect(composeModelLabel(preset, 'standard', 'xhigh')).toBe('GPT-5.6 Terra extra high reasoning');
  });

  it('falls back to the bare label when selections are unknown', () => {
    expect(composeModelLabel(preset, '', '')).toBe('GPT-5.6 Terra');
  });

  it('returns undefined without a preset', () => {
    expect(composeModelLabel(undefined, '1m', 'xhigh')).toBeUndefined();
  });
});

describe('app data loading', () => {
  it('resolves a within-source duplicate quietly, keeping one prompt and no duplicate error', () => {
    const data = loadAppDataFromSources(
      {
        '../../prompts/valid.md': '---\nid: same\ntitle: Valid\ndescription: Valid prompt\ncategory: review\n---\nValid body.',
        '../../prompts/invalid.md': '---\nid: same\ntitle: Invalid\ndescription: Invalid prompt\ncategory: review\n---\nBroken {{bad-name}}.'
      },
      'presets: []'
    );

    expect(data.prompts).toHaveLength(1);
    expect(data.prompts[0].id).toBe('same');
    expect(data.issues.some((issue) => issue.path === '../../prompts/invalid.md' && issue.message.includes('Invalid placeholder syntax'))).toBe(true);
    expect(data.issues.some((issue) => issue.message.includes('Duplicate prompt id'))).toBe(false);
  });

  it('sorts loaded prompts by workflow category before title', () => {
    const data = loadAppDataFromSources(
      {
        '../../prompts/review-b.md': '---\nid: review-b\ntitle: B Review\ndescription: Review prompt\ncategory: review\n---\nReview body.',
        '../../prompts/review-a.md': '---\nid: review-a\ntitle: A Review\ndescription: Review prompt\ncategory: review\n---\nReview body.',
        '../../prompts/writing.md': '---\nid: writing\ntitle: Z Writing\ndescription: Writing prompt\ncategory: writing\n---\nWriting body.',
        '../../prompts/docs.md': '---\nid: docs\ntitle: A Docs\ndescription: Docs prompt\ncategory: docs\n---\nDocs body.'
      },
      'presets: []'
    );

    expect(data.prompts.map((prompt) => prompt.id)).toEqual(['review-a', 'review-b', 'writing', 'docs']);
  });
});

describe('layered prompt sources', () => {
  const validRaw = (id: string, title: string, body = `Body for ${id}.`) =>
    `---\nid: ${id}\ntitle: ${title}\ndescription: A ${title} prompt\ncategory: review\n---\n${body}`;

  it('keys built in prompts by their exact path and external prompts by a qualified key', () => {
    const data = loadAppDataFromSources(
      [
        { source: 'builtin', files: { '../../prompts/a.md': validRaw('a', 'A') } },
        { source: 'global', files: { 'a.md': validRaw('a', 'A global') } },
        { source: 'folder', instanceId: 'ws1', files: { 'a.md': validRaw('a', 'A folder') } }
      ],
      'presets: []'
    );

    const byKey = new Map(data.prompts.map((prompt) => [prompt.key, prompt]));
    expect(byKey.get('../../prompts/a.md')?.source).toBe('builtin');
    expect(byKey.get('../../prompts/a.md')?.sourceLabel).toBe('Built in');
    expect(byKey.get('global:a.md')?.source).toBe('global');
    expect(byKey.get('global:a.md')?.sourceLabel).toBe('Global');
    expect(byKey.get('folder:ws1:a.md')?.source).toBe('folder');
    expect(byKey.get('folder:ws1:a.md')?.sourceLabel).toBe('Folder');
  });

  it('keeps the same id across different sources, showing each with its label', () => {
    const data = loadAppDataFromSources(
      [
        { source: 'builtin', files: { '../../prompts/review.md': validRaw('review-code', 'Built in review') } },
        { source: 'global', files: { 'review.md': validRaw('review-code', 'Global review') } }
      ],
      'presets: []'
    );

    const matching = data.prompts.filter((prompt) => prompt.id === 'review-code');
    expect(matching).toHaveLength(2);
    expect(matching.map((prompt) => prompt.source).sort()).toEqual(['builtin', 'global']);
  });

  it('deduplicates two valid prompts with the same id within one source deterministically', () => {
    const data = loadAppDataFromSources(
      [
        {
          source: 'folder',
          instanceId: 'ws1',
          files: {
            'b.md': validRaw('same', 'Second'),
            'a.md': validRaw('same', 'First')
          }
        }
      ],
      'presets: []'
    );

    const matching = data.prompts.filter((prompt) => prompt.id === 'same');
    expect(matching).toHaveLength(1);
    expect(matching[0].key).toBe('folder:ws1:a.md');
    expect(data.issues.some((issue) => issue.message.includes('Duplicate prompt id'))).toBe(false);
  });

  it('keeps the same id from two different folder workspaces as separate prompts', () => {
    const data = loadAppDataFromSources(
      [
        { source: 'folder', instanceId: 'ws1', files: { 'review.md': validRaw('shared', 'From ws1') } },
        { source: 'folder', instanceId: 'ws2', files: { 'review.md': validRaw('shared', 'From ws2') } }
      ],
      'presets: []'
    );

    const matching = data.prompts.filter((prompt) => prompt.id === 'shared');
    expect(matching).toHaveLength(2);
    expect(matching.map((prompt) => prompt.key).sort()).toEqual(['folder:ws1:review.md', 'folder:ws2:review.md']);
  });

  it('produces identical results for a legacy map and an explicit built in source input', () => {
    const files = {
      '../../prompts/one.md': validRaw('one', 'One'),
      '../../prompts/two.md': validRaw('two', 'Two')
    };
    const fromMap = loadAppDataFromSources(files, 'presets: []');
    const fromInput = loadAppDataFromSources({ source: 'builtin', sourceLabel: 'Built in', files }, 'presets: []');

    expect(fromInput.prompts).toEqual(fromMap.prompts);
    expect(fromInput.issues).toEqual(fromMap.issues);
  });

  it('keeps a source-keyed issue from blocking a same-path prompt in another source', () => {
    const data = loadAppDataFromSources(
      [
        { source: 'global', files: { 'review.md': validRaw('g', 'Global', 'Use {{model}} now.').replace('category: review', 'category: review\nmodel_default: nope') } },
        { source: 'folder', instanceId: 'ws1', files: { 'review.md': validRaw('f', 'Folder', 'Use {{model}} now.') } }
      ],
      'presets: []'
    );

    const globalIssue = data.issues.find((issue) => issue.message.includes('Default model preset'));
    expect(globalIssue?.promptKey).toBe('global:review.md');

    const folderPrompt = data.prompts.find((prompt) => prompt.key === 'folder:ws1:review.md')!;
    const folderResult = composePrompt(folderPrompt, {}, { model: 'GPT' }, { validationIssues: data.issues });
    expect(folderResult.validationBlockers).toEqual([]);

    const globalPrompt = data.prompts.find((prompt) => prompt.key === 'global:review.md')!;
    const globalResult = composePrompt(globalPrompt, {}, { model: 'GPT' }, { validationIssues: data.issues });
    expect(globalResult.validationBlockers.length).toBeGreaterThan(0);
  });

  it('exposes the built in prompt manifest through loadAppData', () => {
    const ids = loadAppData().prompts.map((prompt) => prompt.id).sort();
    expect(ids).toEqual([
      'compare-approaches',
      'explain-a-codebase-area',
      'find-the-root-cause',
      'implementation-plan',
      'investigate-a-topic',
      'new-worktree',
      'refactor-code',
      'review-a-pull-request',
      'review-working-tree-changes',
      'rewrite-for-clarity',
      'summarize-a-source',
      'summarize-branch-diff'
    ]);
  });

  it('labels every built in prompt with the built in source and a path-equal key', () => {
    const data = resolvePromptsForApp([builtinPromptSources()], builtinPresetsRaw());
    expect(data.prompts.every((prompt) => prompt.source === 'builtin' && prompt.sourceLabel === 'Built in')).toBe(true);
    expect(data.prompts.every((prompt) => prompt.key === prompt.path)).toBe(true);
  });
});

function makePrompt(template: string, id = 'prompt', defaultModelId?: string, path = 'prompt.md'): Prompt {
  return {
    id,
    title: id,
    category: 'Test',
    kind: 'prompt',
    tags: [],
    variables: [
      { name: 'name', label: 'Name', required: true },
      { name: 'place', label: 'Place', required: true }
    ],
    options: [],
    defaultModelId,
    template,
    path,
    source: 'builtin',
    sourceLabel: 'Built in',
    key: path
  };
}

function makePromptWithOptions(
  template: string,
  options: PromptOption[] = [
    { id: 'frontendFocus', label: 'Frontend', defaultEnabled: true },
    { id: 'backendFocus', label: 'Backend', defaultEnabled: true }
  ]
): Prompt {
  return {
    ...makePrompt(template),
    options
  };
}

function makePromptWithControls(
  template: string,
  variables: Prompt['variables'],
  options: PromptOption[] = []
): Prompt {
  return {
    ...makePrompt(template),
    variables: [
      { name: 'name', label: 'Name', required: true },
      { name: 'place', label: 'Place', required: true },
      ...variables
    ],
    options
  };
}

function selectVariable(name: string, defaultValue: string, choices: string[]): Prompt['variables'][number] {
  return {
    name,
    label: name,
    required: true,
    control: 'select',
    defaultValue,
    choices: choices.map((id) => ({ id, label: id }))
  };
}
