import { describe, expect, it } from 'vitest';
import { loadAppData } from './loaders';
import { composeModelLabel, composePrompt } from './composer';

const openai = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const reasoning = ['low', 'medium', 'high', 'xhigh', 'max'];
const expected: Record<string, string[]> = {
  'gpt-5-6-sol': openai,
  'gpt-5-6-terra': openai,
  'opus-5': reasoning,
  'sonnet-5': reasoning,
  'gpt-6-1-sol': openai,
  'gpt-6-astra': reasoning,
  'opus-5-5': reasoning,
  'sonnet-5-5': reasoning
};

describe('bundled model guidance', () => {
  it('preserves legacy IDs and fallback order with model-specific reasoning choices', () => {
    const data = loadAppData();
    expect(data.issues).toEqual([]);
    expect(data.presets.map((preset) => preset.id).sort()).toEqual(Object.keys(expected).sort());
    expect(data.presets[0].id).toBe('gpt-5-6-sol');
    for (const preset of data.presets) {
      expect(preset.reasoning.map((choice) => choice.id)).toEqual(expected[preset.id]);
      expect(preset.contexts.map((choice) => choice.id)).toEqual(['standard', '1m']);
      expect(preset.defaultReasoningId).toBe('medium');
    }
  });

  it('composes every declared context/reasoning descriptor without expanding the prompt matrix', () => {
    const { prompts, presets } = loadAppData();
    const base = prompts[0];
    for (const preset of presets) {
      for (const context of preset.contexts) {
        for (const effort of preset.reasoning) {
          const label = composeModelLabel(preset, context.id, effort.id);
          expect(label).toBe([preset.label, context.label, effort.label].filter(Boolean).join(' '));
          const result = composePrompt({
            ...base, variables: [], options: [],
            template: 'Use {{model}} and {{rubberDuckModel}}.'
          }, {}, { model: label, rubberDuckModel: label });
          expect(result.canCopy).toBe(true);
          expect(result.text).toBe(`Use ${label} and ${label}.`);
        }
      }
    }
  });

  it('uses the new explicit default in exactly the six affected built-ins', () => {
    const configured = loadAppData().prompts.filter((prompt) => prompt.defaultModelId);
    expect(configured).toHaveLength(6);
    expect(new Set(configured.map((prompt) => prompt.defaultModelId))).toEqual(new Set(['gpt-6-1-sol']));
  });
});
