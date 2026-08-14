import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { createRoot } from 'react-dom/client';
import { Composer } from '../../src/components/Composer';
import type { ModelPreset, Prompt } from '../../src/data/schemas';

const prompt: Prompt = {
  id: 'wave-2a-composer-fixture',
  key: 'fixture:wave-2a-composer',
  title: 'Wave 2A Composer Fixture',
  description: 'Exercises conditional workflow controls, focus areas, and model roles.',
  category: 'planning',
  kind: 'prompt',
  tags: ['fixture'],
  source: 'folder',
  sourceLabel: 'Test fixture',
  path: 'tests/fixtures/wave-2a.md',
  defaultModelId: 'gpt-5-6-sol',
  variables: [
    {
      name: 'purpose',
      label: 'Purpose',
      required: true,
      control: 'select',
      defaultValue: 'technical',
      choices: [
        { id: 'general', label: 'General analysis' },
        { id: 'technical', label: 'Technical design' }
      ]
    },
    {
      name: 'depth',
      label: 'Analysis depth',
      required: true,
      control: 'slider',
      defaultValue: 'focused',
      choices: [
        { id: 'brief', label: 'Brief' },
        { id: 'focused', label: 'Focused' },
        { id: 'deep', label: 'Deep' }
      ]
    },
    {
      name: 'technicalScope',
      label: 'Technical scope',
      required: true,
      control: 'select',
      defaultValue: 'fullStack',
      visibleWhen: { purpose: ['technical'] },
      choices: [
        { id: 'frontend', label: 'Frontend' },
        { id: 'backend', label: 'Backend' },
        { id: 'fullStack', label: 'Full-stack' }
      ]
    },
    {
      name: 'intent',
      label: 'Intent',
      required: true,
      control: 'textarea',
      defaultValue: 'Design a safer account recovery flow.'
    },
    {
      name: 'technicalNotes',
      label: 'Technical notes',
      required: false,
      control: 'textarea',
      defaultValue: 'Preserve failure-state evidence.',
      visibleWhen: { purpose: ['technical'] }
    }
  ],
  options: [
    {
      id: 'uiMockups',
      label: 'UI mockups',
      description: 'Include visual interaction states.',
      defaultEnabled: true,
      visibleWhen: { purpose: ['technical'] },
      enabledWhen: { technicalScope: ['frontend', 'fullStack'] }
    },
    {
      id: 'apiFlow',
      label: 'API / data-flow diagram',
      defaultEnabled: true,
      visibleWhen: { purpose: ['technical'] }
    },
    {
      id: 'stateDiagram',
      label: 'State diagram',
      defaultEnabled: true,
      visibleWhen: { purpose: ['technical'] },
      enabledWhen: { depth: ['deep'] }
    },
    {
      id: 'generalSummary',
      label: 'General summary',
      defaultEnabled: true,
      visibleWhen: { purpose: ['general'] }
    }
  ],
  modelRoles: {
    model: {
      label: 'Approved execution model',
      description: 'Used by approved implementation workers.'
    },
    rubberDuckModel: {
      label: 'Planning and review model',
      description: 'Used by reviewers that critique execution waves.'
    }
  },
  template: [
    'Intent: {{intent}}',
    '{{#when purpose general}}General analysis.{{/when}}',
    '{{#when purpose technical}}Technical design for {{technicalScope}} at {{depth}} depth.',
    'Use {{model}} for approved implementation work.',
    'Technical notes: {{technicalNotes}}{{/when}}',
    '{{#when purpose technical technicalScope fullStack}}Use {{rubberDuckModel}} to review full-stack integration.{{/when}}',
    '{{#option uiMockups}}Include UI mockups.{{/option}}',
    '{{#option apiFlow}}Include an API / data-flow diagram.{{/option}}',
    '{{#option stateDiagram}}Include a state diagram.{{/option}}',
    '{{#option generalSummary}}Include a concise general summary.{{/option}}'
  ].join('\n')
};

const presets: ModelPreset[] = [
  {
    id: 'gpt-5-6-sol',
    label: 'GPT-5.6 Sol',
    contexts: [
      { id: 'standard', label: '' },
      { id: '1m', label: '1M context' }
    ],
    reasoning: [
      { id: 'low', label: 'low reasoning' },
      { id: 'medium', label: 'medium reasoning' },
      { id: 'high', label: 'high reasoning' }
    ],
    defaultContextId: '1m',
    defaultReasoningId: 'medium'
  },
  {
    id: 'opus-5',
    label: 'Opus 5',
    contexts: [
      { id: 'standard', label: '' },
      { id: '1m', label: '1M context' }
    ],
    reasoning: [
      { id: 'low', label: 'low reasoning' },
      { id: 'medium', label: 'medium reasoning' },
      { id: 'high', label: 'high reasoning' }
    ],
    defaultContextId: '1m',
    defaultReasoningId: 'medium'
  }
];

createRoot(document.getElementById('root')!).render(
  <FluentProvider theme={webLightTheme}>
    <Composer prompt={prompt} presets={presets} issues={[]} />
  </FluentProvider>
);
