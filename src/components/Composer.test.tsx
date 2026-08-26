// @vitest-environment jsdom
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelPreset, Prompt } from '../data/schemas';
import { Composer } from './Composer';

type FrameCallback = (timestamp: number) => void;

let frames = new Map<number, FrameCallback>();
let nextFrameId = 1;
let frameTime = 0;
let reducedMotion = false;
let emptyGeometry = false;
let rectTop = (text: string, index: number) => {
  if (text.includes('Extra passage')) return 340;
  if (text.includes('Deep')) return 180;
  return 260 + index * 20;
};
let resizeCallbacks: ResizeObserverCallback[] = [];

function rectangle(top: number, height = 20): DOMRect {
  return {
    x: 130,
    y: top,
    top,
    right: 230,
    bottom: top + height,
    left: 130,
    width: 100,
    height,
    toJSON: () => ({})
  } as DOMRect;
}

async function flushFrame(milliseconds = 16) {
  await act(async () => {
    const pending = [...frames.values()];
    frames.clear();
    frameTime += milliseconds;
    pending.forEach((callback) => callback(frameTime));
    await Promise.resolve();
  });
}

async function flushMeasurement() {
  await flushFrame();
  await act(async () => Promise.resolve());
}

function configurePreview() {
  const viewport = screen.getByTestId('preview-surface');
  const content = screen.getByTestId('preview-content');
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: 120 },
    scrollHeight: { configurable: true, value: 600 }
  });
  Object.defineProperties(content, {
    offsetTop: { configurable: true, value: 22 },
    scrollHeight: { configurable: true, value: 560 }
  });
  return { viewport, content };
}

function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: 'markers',
    key: 'fixture:markers',
    title: 'Marker fixture',
    description: 'Exercises prompt gutter markers.',
    category: 'planning',
    kind: 'prompt',
    tags: [],
    source: 'folder',
    sourceLabel: 'Fixture',
    path: 'fixture/markers.md',
    variables: [
      {
        name: 'mode',
        label: 'Mode',
        required: true,
        control: 'select',
        defaultValue: 'alpha',
        choices: [
          { id: 'alpha', label: 'Alpha' },
          { id: 'beta', label: 'Beta' }
        ]
      },
      {
        name: 'depth',
        label: 'Depth',
        required: true,
        control: 'slider',
        defaultValue: 'focused',
        choices: [
          { id: 'brief', label: 'Brief' },
          { id: 'focused', label: 'Focused' },
          { id: 'deep', label: 'Deep' }
        ]
      }
    ],
    options: [
      { id: 'extra', label: 'Extra detail', defaultEnabled: false },
      {
        id: 'dependent',
        label: 'Dependent detail',
        defaultEnabled: true,
        enabledWhen: { mode: ['alpha'] }
      }
    ],
    template: [
      '{{#when mode alpha}}Alpha branch.{{/when}}',
      '{{#when mode beta}}Beta branch.{{/when}}',
      'Depth: {{depth}}.',
      '{{#option extra}}Extra passage.{{/option}}',
      '{{#option dependent}}Dependent passage.{{/option}}'
    ].join('\n'),
    ...overrides
  };
}

const modelPresets: ModelPreset[] = [
  {
    id: 'model-a',
    label: 'Model A',
    contexts: [
      { id: 'standard', label: '' },
      { id: 'large', label: 'Large context' }
    ],
    reasoning: [
      { id: 'low', label: 'low reasoning' },
      { id: 'high', label: 'high reasoning' }
    ],
    defaultContextId: 'large',
    defaultReasoningId: 'low'
  },
  {
    id: 'model-b',
    label: 'Model B',
    contexts: [{ id: 'standard', label: '' }],
    reasoning: [{ id: 'high', label: 'high reasoning' }],
    defaultContextId: 'standard',
    defaultReasoningId: 'high'
  }
];

function renderComposer(prompt = makePrompt(), presets: ModelPreset[] = []) {
  const view = render(
    <FluentProvider theme={webLightTheme}>
      <Composer prompt={prompt} presets={presets} issues={[]} />
    </FluentProvider>
  );
  const surface = screen.getByRole('region', { name: 'Composed prompt' })
    .querySelector<HTMLElement>('[data-preview-surface]');
  if (!surface) throw new Error('Preview surface was not rendered.');
  surface.dataset.testid = 'preview-surface';
  const content = surface.querySelector<HTMLElement>('[data-preview-content]');
  if (!content) throw new Error('Preview content was not rendered.');
  content.dataset.testid = 'preview-content';
  configurePreview();
  return view;
}

function markers(kind?: 'addition' | 'deletion') {
  const selector = kind
    ? `[data-composition-marker][data-marker-kind="${kind}"]`
    : '[data-composition-marker]';
  return [...document.querySelectorAll<HTMLElement>(selector)];
}

beforeEach(() => {
  frames = new Map();
  nextFrameId = 1;
  frameTime = 0;
  reducedMotion = false;
  emptyGeometry = false;
  resizeCallbacks = [];
  rectTop = (text, index) => {
    if (text.includes('Extra passage')) return 340;
    if (text.includes('Deep')) return 180;
    return 260 + index * 20;
  };

  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameCallback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
    frames.delete(id);
  }));
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: reducedMotion,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })));
  vi.stubGlobal('ResizeObserver', class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      resizeCallbacks.push(callback);
    }

    observe() {}
    unobserve() {}
    disconnect() {}
  });

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-preview-content')) return rectangle(100, 560);
    if (this.hasAttribute('data-preview-surface')) return rectangle(78, 120);
    return rectangle(100, 20);
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: vi.fn(function (this: Range) {
      if (emptyGeometry) return [] as unknown as DOMRectList;
      const spans = [...document.querySelectorAll<HTMLSpanElement>('[data-segment-id]')];
      const startSpan = this.startContainer.parentElement?.closest<HTMLSpanElement>('[data-segment-id]');
      const endSpan = this.endContainer.parentElement?.closest<HTMLSpanElement>('[data-segment-id]');
      const start = Math.max(0, spans.indexOf(startSpan ?? spans[0]));
      const end = Math.max(start, spans.indexOf(endSpan ?? startSpan ?? spans[start]));
      const values = spans
        .slice(start, end + 1)
        .filter((span) => span.textContent?.trim())
        .map((span, index) => rectangle(rectTop(span.textContent ?? '', start + index)));
      return values as unknown as DOMRectList;
    })
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (Range.prototype as Partial<Range>).getClientRects;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Composer prompt gutter markers', () => {
  it('starts marker-free, keeps exact selectable text, and round-trips an addition', async () => {
    renderComposer();
    await flushMeasurement();

    const region = screen.getByRole('region', { name: 'Composed prompt' });
    const preview = region.querySelector('pre');
    const expected = 'Alpha branch.\n\nDepth: Focused.\n\nDependent passage.';
    expect(preview?.textContent).toBe(expected);
    expect(preview?.querySelectorAll('span')).not.toHaveLength(0);
    expect(markers()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^(Preview|Changes)/ })).toBeNull();
    expect(screen.getByText(/Vertical gutter bars mean additions/)).toBeTruthy();
    expect(region.querySelector('[data-marker-layer]')?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    expect(markers('addition').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Addition marker. Added by Extra detail: enabled' })).toBeTruthy();
    expect(preview?.textContent).toContain('Extra passage.');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    expect(markers()).toHaveLength(0);
    expect(preview?.textContent).toBe(expected);
  });

  it('renders deletion ticks and preserves controller causality for dependent clearing', async () => {
    reducedMotion = true;
    renderComposer();
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Dependent detail' }));
    await flushMeasurement();
    expect(markers('deletion').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), { target: { value: 'beta' } });
    await flushMeasurement();
    expect((screen.getByRole('checkbox', { name: 'Dependent detail' }) as HTMLInputElement).disabled).toBe(true);
    expect(markers('addition').length).toBeGreaterThan(0);
    expect(markers('deletion').length).toBeGreaterThan(0);
    expect(viewport.scrollTop).toBeGreaterThan(0);
  });

  it('renders same-segment insertion, deletion, and replacement semantics with focusable backtraces', async () => {
    renderComposer(makePrompt({
      variables: [{
        name: 'intent',
        label: 'Intent',
        required: true,
        control: 'textarea',
        defaultValue: 'Review code.'
      }],
      options: [],
      template: '{{intent}}'
    }));
    await flushMeasurement();

    fireEvent.change(screen.getByRole('textbox', { name: 'Intent' }), {
      target: { value: 'Review new code.' }
    });
    await flushMeasurement();
    expect(markers('addition').length).toBeGreaterThan(0);
    expect(markers('deletion')).toHaveLength(0);
    expect(screen.getByTestId('preview-surface').querySelector('pre')?.textContent).toBe('Review new code.');

    const target = screen.getByRole('button', { name: 'Addition marker. Changed by Intent: Review new code.' });
    expect(target.getAttribute('data-marker-hit-target')).not.toBeNull();
    fireEvent.focus(target);
    expect((await screen.findByRole('tooltip')).textContent).toContain('Changed by Intent: Review new code.');

    fireEvent.change(screen.getByRole('textbox', { name: 'Intent' }), {
      target: { value: 'Review .' }
    });
    await flushMeasurement();
    expect(markers('addition')).toHaveLength(0);
    expect(markers('deletion').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('textbox', { name: 'Intent' }), {
      target: { value: 'Review docs.' }
    });
    await flushMeasurement();
    expect(markers('addition').length).toBeGreaterThan(0);
    expect(markers('deletion').length).toBeGreaterThan(0);
  });

  it('renders an addition marker for whitespace-only inserted text', async () => {
    renderComposer(makePrompt({
      variables: [{
        name: 'intent',
        label: 'Intent',
        required: true,
        control: 'textarea',
        defaultValue: 'Review code.'
      }],
      options: [],
      template: '{{intent}}'
    }));
    await flushMeasurement();

    fireEvent.change(screen.getByRole('textbox', { name: 'Intent' }), {
      target: { value: 'Review  code.' }
    });
    await flushMeasurement();

    expect(markers('addition').length).toBeGreaterThan(0);
    expect(markers('deletion')).toHaveLength(0);
  });

  it('renders a content-start deletion tick when the current prompt becomes empty', async () => {
    renderComposer(makePrompt({
      variables: [{
        name: 'intent',
        label: 'Intent',
        required: false,
        control: 'textarea',
        defaultValue: 'Remove everything.'
      }],
      options: [],
      template: '{{intent}}'
    }));
    await flushMeasurement();

    fireEvent.change(screen.getByRole('textbox', { name: 'Intent' }), {
      target: { value: '' }
    });
    await flushMeasurement();

    expect(markers('addition')).toHaveLength(0);
    expect(markers('deletion')).toHaveLength(1);
    expect(markers('deletion')[0].style.top).toBe('0px');
    expect(screen.getByRole('button', {
      name: 'Deletion marker. Changed by Intent: empty'
    })).toBeTruthy();
  });

  it('prioritizes the initiating origin and lists dependent origins once', async () => {
    renderComposer();
    await flushMeasurement();
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), { target: { value: 'beta' } });
    await flushMeasurement();

    const relatedTarget = screen.getAllByRole('button', {
      name: /Changed by Mode: Beta\. Also affected by Dependent detail: disabled/
    })[0];
    fireEvent.focus(relatedTarget);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('Changed by Mode: Beta');
    expect(tooltip.textContent?.match(/Also affected by/g)).toHaveLength(1);
    expect(tooltip.textContent).toContain('Dependent detail: disabled');
  });

  it('debounces text scrolling until typing pauses and cancels it on prompt reset', async () => {
    reducedMotion = true;
    const textPrompt = makePrompt({
      variables: [{
        name: 'intent',
        label: 'Intent',
        required: true,
        control: 'textarea',
        defaultValue: 'Review code.'
      }],
      options: [],
      template: '{{intent}}'
    });
    const view = renderComposer(textPrompt);
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');
    const intent = screen.getByRole('textbox', { name: 'Intent' });

    fireEvent.change(intent, { target: { value: 'Review new code.' } });
    await flushMeasurement();
    expect(markers('addition').length).toBeGreaterThan(0);
    expect(viewport.scrollTop).toBe(0);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(viewport.scrollTop).toBe(0);

    fireEvent.change(intent, { target: { value: 'Review newer code.' } });
    await flushMeasurement();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(viewport.scrollTop).toBe(0);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 80)));
    await flushMeasurement();
    expect(viewport.scrollTop).toBeGreaterThan(0);

    viewport.scrollTop = 0;
    resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    await flushMeasurement();
    expect(viewport.scrollTop).toBe(0);

    fireEvent.change(intent, { target: { value: 'Review reset code.' } });
    await flushMeasurement();
    view.rerender(
      <FluentProvider theme={webLightTheme}>
        <Composer
          prompt={makePrompt({
            key: 'fixture:reset-text',
            variables: textPrompt.variables,
            options: [],
            template: 'Reset {{intent}}'
          })}
          presets={[]}
          issues={[]}
        />
      </FluentProvider>
    );
    configurePreview();
    viewport.scrollTop = 0;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    await flushMeasurement();
    expect(viewport.scrollTop).toBe(0);

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    fireEvent.change(screen.getByRole('textbox', { name: 'Intent' }), {
      target: { value: 'Pending unmount.' }
    });
    view.unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('cancels a pending debounced text scroll when the user scrolls manually', async () => {
    reducedMotion = true;
    renderComposer(makePrompt({
      variables: [{
        name: 'intent',
        label: 'Intent',
        required: true,
        control: 'textarea',
        defaultValue: 'Review code.'
      }],
      options: [],
      template: '{{intent}}'
    }));
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');

    fireEvent.change(screen.getByRole('textbox', { name: 'Intent' }), {
      target: { value: 'Review delayed scrolling.' }
    });
    await flushMeasurement();
    fireEvent.wheel(viewport);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    await flushMeasurement();

    expect(viewport.scrollTop).toBe(0);
  });

  it('targets independent model preset, context, and reasoning actions', async () => {
    reducedMotion = true;
    renderComposer(makePrompt({
      variables: [],
      options: [],
      modelRoles: {
        model: { label: 'Primary model', description: 'Primary role.' },
        rubberDuckModel: { label: 'Alternative model', description: 'Alternative role.' }
      },
      template: [
        'Start.',
        'Primary{{#model model}} with {{model}}{{/model}}.',
        'Alternative{{#model rubberDuckModel}} with {{rubberDuckModel}}{{/model}}.'
      ].join('\n')
    }), modelPresets);
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');
    const primary = screen.getByRole('group', { name: 'Primary model' });
    const alternative = screen.getByRole('group', { name: 'Alternative model' });
    const primaryPreset = primary.getElementsByTagName('select')[0];
    const alternativePreset = alternative.getElementsByTagName('select')[0];

    fireEvent.change(primaryPreset, { target: { value: 'model-a' } });
    await flushMeasurement();
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', {
      name: /Changed by Primary model: Model A Large context low reasoning/
    }).length).toBeGreaterThan(0);
    expect((alternativePreset as HTMLSelectElement).value).toBe('');

    viewport.scrollTop = 0;
    const primarySelects = primary.getElementsByTagName('select');
    fireEvent.change(primarySelects[1], { target: { value: 'standard' } });
    await flushMeasurement();
    expect(screen.getAllByRole('button', {
      name: /Changed by Primary model: Model A low reasoning/
    }).length).toBeGreaterThan(0);

    viewport.scrollTop = 0;
    fireEvent.change(primary.getElementsByTagName('select')[2], { target: { value: 'high' } });
    await flushMeasurement();
    expect(screen.getAllByRole('button', {
      name: /Changed by Primary model: Model A high reasoning/
    }).length).toBeGreaterThan(0);

    viewport.scrollTop = 0;
    fireEvent.change(alternativePreset, { target: { value: 'model-a' } });
    await flushMeasurement();
    expect(screen.getAllByRole('button', {
      name: /Changed by Alternative model: Model A Large context low reasoning/
    }).length).toBeGreaterThan(0);
    expect((primaryPreset as HTMLSelectElement).value).toBe('model-a');

    fireEvent.change(alternative.getElementsByTagName('select')[1], { target: { value: 'standard' } });
    await flushMeasurement();
    expect(screen.getAllByRole('button', {
      name: /Changed by Alternative model: Model A low reasoning/
    }).length).toBeGreaterThan(0);

    fireEvent.change(alternative.getElementsByTagName('select')[2], { target: { value: 'high' } });
    await flushMeasurement();
    expect(screen.getAllByRole('button', {
      name: /Changed by Alternative model: Model A high reasoning/
    }).length).toBeGreaterThan(0);
    expect((primaryPreset as HTMLSelectElement).value).toBe('model-a');
    const preview = screen.getByTestId('preview-surface').querySelector('pre')?.textContent ?? '';
    expect(preview).toContain('Model A high reasoning');
  });

  it('does not register required-default model reconciliation as a model action', async () => {
    reducedMotion = true;
    renderComposer(makePrompt({
      defaultModelId: 'model-a',
      variables: [{
        name: 'scope',
        label: 'Scope',
        required: true,
        control: 'select',
        defaultValue: 'optional',
        choices: [
          { id: 'optional', label: 'Optional' },
          { id: 'required', label: 'Required' }
        ]
      }],
      options: [],
      modelRoles: {
        model: { label: 'Primary model', description: 'Primary role.' }
      },
      template: [
        '{{#when scope optional}}Optional{{#model model}} with {{model}}{{/model}}.{{/when}}',
        '{{#when scope required}}Required {{model}}.{{/when}}'
      ].join('\n')
    }), modelPresets);
    await flushMeasurement();
    const scope = screen.getByRole('combobox', { name: 'Scope' });
    const model = screen.getByRole('combobox', { name: 'Primary model' });
    expect((model as HTMLSelectElement).value).toBe('');

    fireEvent.change(scope, { target: { value: 'required' } });
    await flushMeasurement();
    await flushMeasurement();
    expect((model as HTMLSelectElement).value).toBe('model-a');
    expect(screen.getAllByRole('button', { name: /Changed by Scope: Required/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Changed by Primary model/ })).toBeNull();

    fireEvent.change(scope, { target: { value: 'optional' } });
    await flushMeasurement();
    await flushMeasurement();
    expect((model as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('button', { name: /Changed by Primary model/ })).toBeNull();
  });

  it('resets valid model variants to prompt defaults when the prompt signature changes', async () => {
    const requiredPrompt = makePrompt({
      key: 'fixture:required-model-one',
      defaultModelId: 'model-a',
      variables: [],
      options: [],
      modelRoles: {
        model: { label: 'Primary model', description: 'Primary role.' }
      },
      template: 'Use {{model}}.'
    });
    const view = renderComposer(requiredPrompt, modelPresets);
    await flushMeasurement();
    let group = screen.getByRole('group', { name: 'Primary model' });
    let selects = group.getElementsByTagName('select');

    fireEvent.change(selects[1], { target: { value: 'standard' } });
    fireEvent.change(selects[2], { target: { value: 'high' } });
    await flushMeasurement();
    expect((selects[1] as HTMLSelectElement).value).toBe('standard');
    expect((selects[2] as HTMLSelectElement).value).toBe('high');

    view.rerender(
      <FluentProvider theme={webLightTheme}>
        <Composer
          prompt={{ ...requiredPrompt, key: 'fixture:required-model-two', title: 'Second required model' }}
          presets={modelPresets}
          issues={[]}
        />
      </FluentProvider>
    );
    configurePreview();
    await flushMeasurement();
    group = screen.getByRole('group', { name: 'Primary model' });
    selects = group.getElementsByTagName('select');

    expect((selects[1] as HTMLSelectElement).value).toBe('large');
    expect((selects[2] as HTMLSelectElement).value).toBe('low');
    expect(markers()).toHaveLength(0);
  });

  it('targets the visually topmost marker for the latest origin and uses plan order for a tie', async () => {
    reducedMotion = true;
    renderComposer();
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');

    fireEvent.change(screen.getByRole('slider', { name: 'Depth' }), { target: { value: '2' } });
    await flushMeasurement();
    expect(viewport.scrollTop).toBeCloseTo(43.5, 0);

    viewport.scrollTop = 0;
    rectTop = (text) => text.includes('Beta branch') ? 180 : 340;
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), { target: { value: 'beta' } });
    await flushMeasurement();
    expect(viewport.scrollTop).toBeCloseTo(52, 0);
  });

  it('does not scroll an already comfortable marker and clamps an off-screen target', async () => {
    reducedMotion = true;
    rectTop = (text, index) => text.includes('Extra passage') ? 30 : 100 + index * 20;
    renderComposer();
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    expect(viewport.scrollTop).toBe(0);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    rectTop = (text, index) => text.includes('Extra passage') ? 900 : 100 + index * 20;
    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    expect(viewport.scrollTop).toBe(480);
  });

  it('animates over multiple frames, settles, and cancels for a new action or user scroll', async () => {
    renderComposer();
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    await flushFrame();
    expect(viewport.scrollTop).toBe(0);
    await flushFrame();
    const moving = viewport.scrollTop;
    expect(moving).toBeGreaterThan(0);
    expect(moving).toBeLessThan(312);

    fireEvent.change(screen.getByRole('slider', { name: 'Depth' }), { target: { value: '2' } });
    expect(cancelAnimationFrame).toHaveBeenCalled();
    const afterCancellation = viewport.scrollTop;
    await flushMeasurement();
    fireEvent.wheel(viewport);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    await flushFrame(240);
    expect(viewport.scrollTop).toBe(afterCancellation);

    fireEvent.change(screen.getByRole('slider', { name: 'Depth' }), { target: { value: '0' } });
    await flushMeasurement();
    await flushFrame();
    const beforeTouch = viewport.scrollTop;
    fireEvent.touchStart(viewport);
    await flushFrame(240);
    expect(viewport.scrollTop).toBe(beforeTouch);

    fireEvent.change(screen.getByRole('slider', { name: 'Depth' }), { target: { value: '2' } });
    await flushMeasurement();
    await flushFrame();
    const beforeKey = viewport.scrollTop;
    fireEvent.keyDown(viewport, { key: 'PageDown' });
    await flushFrame(240);
    expect(viewport.scrollTop).toBe(beforeKey);

    fireEvent.change(screen.getByRole('slider', { name: 'Depth' }), { target: { value: '0' } });
    await flushMeasurement();
    await flushFrame();
    await flushFrame(240);
    expect(frames.size).toBe(0);
    expect(viewport.scrollTop).toBeGreaterThan(0);
  });

  it('consumes targeting once across resize measurements and honors reduced motion immediately', async () => {
    reducedMotion = true;
    renderComposer();
    await flushMeasurement();
    const viewport = screen.getByTestId('preview-surface');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    expect(viewport.scrollTop).toBeCloseTo(212, 0);
    viewport.scrollTop = 0;
    resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    await flushMeasurement();
    expect(viewport.scrollTop).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('cancels and clears marker state when the prompt signature resets', async () => {
    const view = renderComposer();
    await flushMeasurement();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Extra detail' }));
    await flushMeasurement();
    await flushFrame();
    expect(frames.size).toBeGreaterThan(0);

    const nextPrompt = makePrompt({
      key: 'fixture:next',
      title: 'Next fixture',
      template: 'Next {{mode}} at {{depth}}.'
    });
    view.rerender(
      <FluentProvider theme={webLightTheme}>
        <Composer prompt={nextPrompt} presets={[]} issues={[]} />
      </FluentProvider>
    );
    configurePreview();
    await flushMeasurement();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(markers()).toHaveLength(0);
    expect(screen.getByTestId('preview-surface').querySelector('pre')?.textContent).toBe('Next Alpha at Focused.');
  });

  it('fails closed to exact plain preview when trace mapping or geometry is unavailable', async () => {
    emptyGeometry = true;
    renderComposer(makePrompt({
      variables: [],
      options: [
        { id: 'outer', label: 'Outer', defaultEnabled: true },
        { id: 'inner', label: 'Inner', defaultEnabled: true }
      ],
      template: '{{#option outer}}Outer {{#option inner}}Inner{{/option}} end{{/option}}'
    }));
    await flushMeasurement();

    const preview = screen.getByTestId('preview-surface').querySelector('pre');
    expect(preview?.textContent).toBe('Outer {{#option inner}}Inner end{{/option}}');
    expect(markers()).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Copy composed prompt' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
