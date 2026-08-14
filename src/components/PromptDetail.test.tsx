// @vitest-environment jsdom
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Prompt } from '../data/schemas';
import { PromptDetail } from './PromptDetail';

afterEach(cleanup);

describe('PromptDetail', () => {
  it('shows model roles and author-facing applicability metadata', () => {
    const prompt: Prompt = {
      id: 'example',
      title: 'Example',
      description: 'Example prompt',
      category: 'planning',
      kind: 'prompt',
      tags: [],
      variables: [
        {
          name: 'purpose',
          label: 'Purpose',
          required: true,
          control: 'select',
          defaultValue: 'technicalDesign',
          choices: [
            { id: 'general', label: 'General analysis' },
            { id: 'technicalDesign', label: 'Technical design' }
          ]
        },
        {
          name: 'technicalScope',
          label: 'Technical scope',
          required: true,
          control: 'select',
          defaultValue: 'frontend',
          visibleWhen: { purpose: ['technicalDesign'] },
          choices: [
            { id: 'frontend', label: 'Frontend' },
            { id: 'fullStack', label: 'Full-stack' }
          ]
        }
      ],
      options: [
        {
          id: 'uiMockups',
          label: 'UI mockups',
          description: 'Include interface mockups.',
          defaultEnabled: false,
          visibleWhen: { purpose: ['technicalDesign'] },
          enabledWhen: { technicalScope: ['frontend', 'fullStack'] }
        }
      ],
      modelRoles: {
        model: {
          label: 'Approved execution model',
          description: 'Used by approved implementation workers.'
        }
      },
      defaultModelId: 'gpt',
      template: 'Use {{model}}.',
      path: 'prompts/example.md',
      source: 'builtin',
      sourceLabel: 'Built in',
      key: 'prompts/example.md'
    };

    const { container } = render(
      <FluentProvider theme={webLightTheme}>
        <PromptDetail
          prompt={prompt}
          presets={[{ id: 'gpt', label: 'GPT', contexts: [], reasoning: [] }]}
        />
      </FluentProvider>
    );

    expect(container.textContent).toContain('{{model}} — Approved execution model — Used by approved implementation workers.');
    expect(container.textContent).toContain('visible_when: Purpose is Technical design');
    expect(container.textContent).toContain('enabled_when: Technical scope is one of Frontend or Full-stack');
    expect(container.textContent).toContain('UI mockups (disabled by default)');
  });
});
