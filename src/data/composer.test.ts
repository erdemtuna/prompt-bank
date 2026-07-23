import { describe, expect, it } from 'vitest';
import { composePrompt, initialOptionValues, initialVariableValues, promptUsesModelPlaceholder, promptUsesRubberDuckModelPlaceholder } from './composer';
import { builtinPresetsRaw, builtinPromptSources, loadAppData, loadAppDataFromSources, resolvePromptsForApp } from './loaders';
import { parseModelPresets, parsePromptFile, validatePromptCollection, type Prompt, type PromptIdentity, type PromptOption } from './schemas';
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

    expect(result.text).toBe('Start.\n\nFrontend UI.\n\nEnd.');
    expect(result.canCopy).toBe(true);
  });

  it('collapses blank lines and omits disabled blocks when the template uses CRLF line endings', () => {
    const prompt = makePromptWithOptions(
      'Start.\n{{#option frontendFocus}}\nFrontend {{name}}.\n{{/option}}\n{{#option backendFocus}}\nBackend {{place}}.\n{{/option}}\nEnd.'.replace(/\n/g, '\r\n')
    );

    const bothEnabled = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: true, backendFocus: true } });
    expect(bothEnabled.text).toBe('Start.\n\nFrontend UI.\n\nBackend API.\n\nEnd.');
    expect(bothEnabled.text).not.toContain('\r');

    const backendOnly = composePrompt(prompt, { name: 'UI', place: 'API' }, {}, { optionValues: { frontendFocus: false, backendFocus: true } });
    expect(backendOnly.text).toBe('Start.\n\nBackend API.\n\nEnd.');
  });

  it('collapses whitespace-only blank lines and leftover gaps under CRLF when an option is disabled', () => {
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
    const issues = validatePromptCollection([promptA, promptB], [{ id: 'gpt-5-5', label: 'GPT-5.5' }]);

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

    expect(data.prompts.map((prompt) => prompt.id)).toEqual(['writing', 'review-a', 'review-b', 'docs']);
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
      'explain-code',
      'inspect-git-status',
      'plan-a-task',
      'refactor-code',
      'review-code-changes',
      'summarize-text'
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
