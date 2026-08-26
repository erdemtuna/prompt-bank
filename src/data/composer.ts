import {
  evaluatePromptApplicability,
  extractApplicabilityVariableNames,
  extractConditionVariableNames,
  extractPlaceholders,
  modelRoleRequirements,
  renderPromptTemplateModels,
  renderPromptTemplateControls,
  type ModelPreset,
  type ModelRoleName,
  type ModelRoleRequirements,
  type Prompt,
  type PromptApplicability,
  type PromptOption,
  type PromptTemplateToken,
  type PromptVariable,
  type ValidationIssue,
  tokenizePromptTemplate
} from './schemas';

export type VariableValues = Record<string, string>;
export type OptionValues = Record<string, boolean>;
export type BuiltInValues = Record<string, string | undefined>;
const modelBuiltIns = ['model', 'rubberDuckModel'] as const;

export function composeModelLabel(preset: ModelPreset | undefined, contextId: string, reasoningId: string): string | undefined {
  if (!preset) return undefined;
  const context = preset.contexts.find((variant) => variant.id === contextId);
  const reasoning = preset.reasoning.find((variant) => variant.id === reasoningId);
  return [preset.label, context?.label, reasoning?.label]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export type CompositionResult = {
  text: string;
  activeVariableNames: string[];
  missingRequired: string[];
  missingBuiltIns: string[];
  validationBlockers: string[];
  disabledReasons: string[];
  usesModelPlaceholder: boolean;
  usesRubberDuckModelPlaceholder: boolean;
  modelRoleRequirements: ModelRoleRequirements;
  applicability: PromptApplicability;
  effectiveOptionValues: OptionValues;
  isValid: boolean;
  canCopy: boolean;
  trace?: CompositionTrace;
};

export type CompositionOptions = {
  validationIssues?: ValidationIssue[];
  optionValues?: OptionValues;
  trace?: boolean;
};

export type CompositionControlOrigin =
  | { kind: 'variable'; name: string }
  | { kind: 'option'; id: string }
  | { kind: 'model'; role: ModelRoleName };

export type CompositionSegment = {
  id: string;
  text: string;
  origins: CompositionControlOrigin[];
};

export type CompositionTrace =
  | { status: 'available'; segments: CompositionSegment[] }
  | { status: 'unavailable'; reason: 'segment-text-mismatch' };

export type CompositionDeletionAnchor =
  | {
      kind: 'segment';
      currentSegmentId: string;
      offset: number;
    }
  | { kind: 'content-start' };

export type CompositionSegmentRange = {
  currentSegmentId: string;
  startOffset: number;
  endOffset: number;
};

type CompositionMarkerBase = {
  order: number;
  runIds: number[];
  origins: CompositionControlOrigin[];
};

export type CompositionMarker =
  | CompositionMarkerBase & {
      kind: 'addition';
      currentRanges: CompositionSegmentRange[];
    }
  | CompositionMarkerBase & {
      kind: 'deletion';
      anchor: CompositionDeletionAnchor;
    };

export type CompositionMarkerPlan =
  | { status: 'available'; markers: CompositionMarker[] }
  | { status: 'unavailable' };

type TraceDifference = {
  runId: number;
  operationOrder: number;
  kind: 'addition' | 'deletion';
  segment: CompositionSegment;
  currentIndex: number;
  currentRange?: CompositionSegmentRange;
  deletionAnchor?: CompositionDeletionAnchor;
};

type TraceSurvivor = {
  currentIndex: number;
  segment: CompositionSegment;
};

type TraceDifferencePlan = {
  differences: TraceDifference[];
  survivors: TraceSurvivor[];
};

export function planCompositionMarkers(
  baseline: CompositionTrace | undefined,
  current: CompositionTrace | undefined
): CompositionMarkerPlan {
  if (baseline?.status !== 'available' || current?.status !== 'available') {
    return { status: 'unavailable' };
  }
  if (
    baseline.segments.map((segment) => segment.text).join('')
    === current.segments.map((segment) => segment.text).join('')
  ) {
    return { status: 'available', markers: [] };
  }

  const differencePlan = traceDifferences(baseline.segments, current.segments);
  const candidates: Array<{
    firstOperationOrder: number;
    runIds: number[];
    origins: CompositionControlOrigin[];
    marker:
      | { kind: 'addition'; currentRanges: CompositionSegmentRange[] }
      | { kind: 'deletion'; anchor: CompositionDeletionAnchor };
  }> = [];
  const additionsByRun = new Map<number, typeof candidates[number]>();
  const deletionsByAnchor = new Map<string, typeof candidates[number]>();

  for (const difference of differencePlan.differences) {
    if (difference.kind === 'addition') {
      const existing = additionsByRun.get(difference.runId);
      if (existing?.marker.kind === 'addition') {
        existing.marker.currentRanges.push(difference.currentRange ?? {
          currentSegmentId: difference.segment.id,
          startOffset: 0,
          endOffset: difference.segment.text.length
        });
        existing.origins = mergeOrigins(existing.origins, difference.segment.origins);
        continue;
      }
      const candidate: typeof candidates[number] = {
        firstOperationOrder: difference.operationOrder,
        runIds: [difference.runId],
        origins: mergeOrigins([], difference.segment.origins),
        marker: {
          kind: 'addition',
          currentRanges: [difference.currentRange ?? {
            currentSegmentId: difference.segment.id,
            startOffset: 0,
            endOffset: difference.segment.text.length
          }]
        }
      };
      additionsByRun.set(difference.runId, candidate);
      candidates.push(candidate);
      continue;
    }

    const anchor = difference.deletionAnchor
      ?? deletionAnchor(difference.currentIndex, differencePlan.survivors);
    const anchorKey = deletionAnchorKey(anchor);
    const existing = deletionsByAnchor.get(anchorKey);
    if (existing?.marker.kind === 'deletion') {
      existing.origins = mergeOrigins(existing.origins, difference.segment.origins);
      if (!existing.runIds.includes(difference.runId)) existing.runIds.push(difference.runId);
      continue;
    }
    const candidate: typeof candidates[number] = {
      firstOperationOrder: difference.operationOrder,
      runIds: [difference.runId],
      origins: mergeOrigins([], difference.segment.origins),
      marker: { kind: 'deletion', anchor }
    };
    deletionsByAnchor.set(anchorKey, candidate);
    candidates.push(candidate);
  }

  candidates.sort((left, right) => left.firstOperationOrder - right.firstOperationOrder);
  return {
    status: 'available',
    markers: candidates.map((candidate, order) => ({
      ...candidate.marker,
      order,
      runIds: candidate.runIds,
      origins: candidate.origins
    }))
  };
}

function deletionAnchor(
  currentIndex: number,
  survivors: TraceSurvivor[]
): CompositionDeletionAnchor {
  const next = survivors.find((survivor) =>
    survivor.currentIndex >= currentIndex && survivor.segment.text.trim().length > 0
  );
  if (next) {
    return {
      kind: 'segment',
      currentSegmentId: next.segment.id,
      offset: Math.max(0, next.segment.text.search(/\S/))
    };
  }

  for (let index = survivors.length - 1; index >= 0; index -= 1) {
    const previous = survivors[index];
    if (previous.currentIndex < currentIndex && previous.segment.text.trim().length > 0) {
      return {
        kind: 'segment',
        currentSegmentId: previous.segment.id,
        offset: Math.max(0, previous.segment.text.search(/\s*$/))
      };
    }
  }

  return { kind: 'content-start' };
}

function deletionAnchorKey(anchor: CompositionDeletionAnchor): string {
  return anchor.kind === 'content-start'
    ? anchor.kind
    : `${anchor.kind}:${anchor.currentSegmentId}:${anchor.offset}`;
}

function traceDifferences(
  left: CompositionSegment[],
  right: CompositionSegment[]
): TraceDifferencePlan {
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lengths[leftIndex][rightIndex] = left[leftIndex].id === right[rightIndex].id
        ? lengths[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(lengths[leftIndex + 1][rightIndex], lengths[leftIndex][rightIndex + 1]);
    }
  }

  const differences: TraceDifference[] = [];
  const survivors: TraceSurvivor[] = [];
  let runId = 0;
  let inChangeRun = false;
  const append = (
    kind: TraceDifference['kind'],
    segment: CompositionSegment,
    currentIndex: number,
    details: Pick<TraceDifference, 'currentRange' | 'deletionAnchor'> = {}
  ) => {
    if (!inChangeRun) {
      runId += 1;
      inChangeRun = true;
    }
    differences.push({
      runId,
      operationOrder: differences.length,
      kind,
      segment,
      currentIndex,
      ...details
    });
  };

  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const baselineSegment = left[leftIndex];
    const currentSegment = right[rightIndex];
    if (baselineSegment.id === currentSegment.id) {
      if (baselineSegment.text !== currentSegment.text) {
        const { prefixLength, baselineEnd, currentEnd } = segmentChangeBounds(
          baselineSegment.text,
          currentSegment.text
        );
        if (baselineEnd > prefixLength) {
          append('deletion', baselineSegment, rightIndex, {
            deletionAnchor: {
              kind: 'segment',
              currentSegmentId: currentSegment.id,
              offset: prefixLength
            }
          });
        }
        if (currentEnd > prefixLength) {
          append('addition', currentSegment, rightIndex, {
            currentRange: {
              currentSegmentId: currentSegment.id,
              startOffset: prefixLength,
              endOffset: currentEnd
            }
          });
        }
      } else {
        inChangeRun = false;
      }
      survivors.push({ currentIndex: rightIndex, segment: currentSegment });
      leftIndex += 1;
      rightIndex += 1;
    } else if (lengths[leftIndex + 1][rightIndex] >= lengths[leftIndex][rightIndex + 1]) {
      append('deletion', baselineSegment, rightIndex);
      leftIndex += 1;
    } else {
      append('addition', currentSegment, rightIndex);
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) append('deletion', left[leftIndex++], rightIndex);
  while (rightIndex < right.length) {
    append('addition', right[rightIndex], rightIndex);
    rightIndex += 1;
  }

  return { differences, survivors };
}

function segmentChangeBounds(
  baseline: string,
  current: string
): { prefixLength: number; baselineEnd: number; currentEnd: number } {
  const maximumPrefix = Math.min(baseline.length, current.length);
  let prefixLength = 0;
  while (prefixLength < maximumPrefix && baseline[prefixLength] === current[prefixLength]) {
    prefixLength += 1;
  }

  const maximumSuffix = Math.min(
    baseline.length - prefixLength,
    current.length - prefixLength
  );
  let suffixLength = 0;
  while (
    suffixLength < maximumSuffix
    && baseline[baseline.length - suffixLength - 1] === current[current.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  return {
    prefixLength,
    baselineEnd: baseline.length - suffixLength,
    currentEnd: current.length - suffixLength
  };
}

export function initialVariableValues(variables: PromptVariable[]): VariableValues {
  return Object.fromEntries(variables.map((variable) => [variable.name, variable.defaultValue ?? '']));
}

export function initialOptionValues(options: PromptOption[]): OptionValues {
  return Object.fromEntries(options.map((option) => [option.id, option.defaultEnabled]));
}

export type PromptControlState = {
  applicability: PromptApplicability;
  effectiveOptionValues: OptionValues;
  inactiveConditionVariableNames: Set<string>;
  allOptionsDisabled: boolean;
};

export function resolvePromptControlState(
  prompt: Pick<Prompt, 'variables' | 'options'>,
  values: VariableValues,
  optionValues: OptionValues
): PromptControlState {
  const variableValues = { ...initialVariableValues(prompt.variables), ...values };
  const applicability = evaluatePromptApplicability(prompt, variableValues);
  const effectiveOptionValues = Object.fromEntries(prompt.options.map((option) => {
    const state = applicability.options[option.id];
    return [option.id, Boolean(state?.visible && state.enabled && optionValues[option.id])];
  }));
  const visibleOptions = prompt.options.filter((option) => applicability.options[option.id]?.visible);
  return {
    applicability,
    effectiveOptionValues,
    inactiveConditionVariableNames: new Set(
      prompt.variables
        .filter((variable) => {
          const state = applicability.variables[variable.name];
          return !state?.visible
            || ((variable.control === 'select' || variable.control === 'slider') && !state.enabled);
        })
        .map((variable) => variable.name)
    ),
    allOptionsDisabled: visibleOptions.length > 0
      && visibleOptions.every((option) => effectiveOptionValues[option.id] === false)
  };
}

export function normalizeOptionValues(
  prompt: Pick<Prompt, 'variables' | 'options'>,
  values: VariableValues,
  optionValues: OptionValues
): OptionValues {
  return resolvePromptControlState(prompt, values, optionValues).effectiveOptionValues;
}

export function promptUsesModelPlaceholder(prompt: Prompt): boolean {
  return promptModelRoleRequirements(prompt).model !== 'inactive';
}

export function promptUsesRubberDuckModelPlaceholder(prompt: Prompt): boolean {
  return promptModelRoleRequirements(prompt).rubberDuckModel !== 'inactive';
}

export function promptModelRoleRequirements(prompt: Prompt): ModelRoleRequirements {
  return modelRoleRequirements(
    renderPromptWorkflowTemplate(prompt, initialOptionValues(prompt.options), initialVariableValues(prompt.variables))
  );
}

export function composePrompt(prompt: Prompt, values: VariableValues, builtIns: BuiltInValues = {}, options: CompositionOptions = {}): CompositionResult {
  const requestedOptionValues = { ...initialOptionValues(prompt.options), ...(options.optionValues ?? {}) };
  const variableValues = { ...initialVariableValues(prompt.variables), ...values };
  const controlState = resolvePromptControlState(prompt, variableValues, requestedOptionValues);
  const workflowTemplate = renderPromptWorkflowTemplate(prompt, controlState.effectiveOptionValues, variableValues, controlState);
  const roleRequirements = modelRoleRequirements(workflowTemplate);
  const renderedTemplate = renderPromptTemplateModels(workflowTemplate, builtIns);
  const placeholders = extractPlaceholders(renderedTemplate);
  const conditionVariableNames = extractConditionVariableNames(prompt.template);
  const applicabilityVariableNames = extractApplicabilityVariableNames(prompt);
  const usesModelPlaceholder = roleRequirements.model !== 'inactive';
  const usesRubberDuckModelPlaceholder = roleRequirements.rubberDuckModel !== 'inactive';
  const usesAnyModelPlaceholder = usesModelPlaceholder || usesRubberDuckModelPlaceholder;
  const hasConditionalBlocks = prompt.options.length > 0 || conditionVariableNames.length > 0 || applicabilityVariableNames.length > 0;
  const activeVariableNames = !hasConditionalBlocks
    ? prompt.variables
      .filter((variable) => isVariableActive(controlState.applicability, variable.name))
      .map((variable) => variable.name)
    : prompt.variables
      .filter((variable) =>
        isVariableActive(controlState.applicability, variable.name)
        && (
          placeholders.includes(variable.name)
          || conditionVariableNames.includes(variable.name)
          || applicabilityVariableNames.includes(variable.name)
        )
      )
      .map((variable) => variable.name);
  const missingRequired = prompt.variables
    .filter((variable) => activeVariableNames.includes(variable.name) && variable.required && !(variableValues[variable.name] ?? '').trim())
    .map((variable) => variable.name);
  const invalidSelections = prompt.variables
    .filter((variable) =>
      activeVariableNames.includes(variable.name)
      && (variable.control === 'select' || variable.control === 'slider')
      && !variable.choices?.some((choice) => choice.id === variableValues[variable.name])
    )
    .map((variable) => variable.name);
  const missingBuiltIns = modelBuiltIns.filter((name) => placeholders.includes(name) && !builtIns[name]?.trim());
  const usesSelectedOrRequiredModel = modelBuiltIns.some((name) =>
    roleRequirements[name] === 'required'
    || (roleRequirements[name] === 'optional' && Boolean(builtIns[name]?.trim()))
  );
  const requiresDefaultModel = modelBuiltIns.some((name) => roleRequirements[name] === 'required');
  const validationBlockers = validationBlockersForPrompt(
    prompt,
    options.validationIssues ?? [],
    usesAnyModelPlaceholder,
    usesSelectedOrRequiredModel,
    requiresDefaultModel
  );

  const text = renderedTemplate.replace(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g, (_, name: string) => {
    if (isModelBuiltIn(name) && !builtIns[name]?.trim()) {
      return `{{${name}}}`;
    }
    const variable = prompt.variables.find((candidate) => candidate.name === name);
    if (variable) {
      if (!isVariableActive(controlState.applicability, name)) return '';
      return interpolatedVariableValue(variable, variableValues[name] ?? '');
    }
    return builtIns[name] ?? '';
  });
  const trace = options.trace
    ? traceComposition(prompt, variableValues, builtIns, controlState, text)
    : undefined;
  const disabledReasons = [
    ...missingRequired.map((name) => `Missing required variable "${name}".`),
    ...invalidSelections.map((name) => `Select a valid choice for variable "${name}".`),
    ...missingBuiltIns.map((name) => `Select a valid ${modelBuiltInLabel(name)} for the built-in {{${name}}} placeholder.`),
    ...validationBlockers
  ];

  return {
    text,
    activeVariableNames,
    missingRequired,
    missingBuiltIns,
    validationBlockers,
    disabledReasons,
    usesModelPlaceholder,
    usesRubberDuckModelPlaceholder,
    modelRoleRequirements: roleRequirements,
    applicability: controlState.applicability,
    effectiveOptionValues: controlState.effectiveOptionValues,
    isValid: disabledReasons.length === 0,
    canCopy: disabledReasons.length === 0,
    ...(trace ? { trace } : {})
  };
}

type TraceAtom = {
  character: string;
  sourceId: string;
  origins: CompositionControlOrigin[];
};

type TraceBlockOpen =
  | Extract<PromptTemplateToken, { kind: 'optionOpen' }>
  | Extract<PromptTemplateToken, { kind: 'allOptionsDisabledOpen' }>
  | Extract<PromptTemplateToken, { kind: 'whenOpen' }>
  | Extract<PromptTemplateToken, { kind: 'modelOpen' }>;

type TraceBlockClose =
  | Extract<PromptTemplateToken, { kind: 'optionClose' }>
  | Extract<PromptTemplateToken, { kind: 'allOptionsDisabledClose' }>
  | Extract<PromptTemplateToken, { kind: 'whenClose' }>
  | Extract<PromptTemplateToken, { kind: 'modelClose' }>;

type TraceBlock = {
  open: TraceBlockOpen;
  close: TraceBlockClose;
  enabled: boolean;
  origins: CompositionControlOrigin[];
};

function traceComposition(
  prompt: Prompt,
  variableValues: VariableValues,
  builtIns: BuiltInValues,
  controlState: PromptControlState,
  expectedText: string
): CompositionTrace {
  let atoms = traceAtomsForTemplate(prompt.template);
  atoms = normalizeTraceLineEndings(atoms);
  atoms = stripStandaloneTraceBlockTagLines(atoms);
  atoms = renderTraceOptionBlocks(atoms, prompt, controlState);
  atoms = renderTraceWhenBlocks(atoms, prompt, variableValues, controlState.inactiveConditionVariableNames);
  atoms = cleanTraceTemplate(atoms);
  atoms = renderTraceModelBlocks(atoms, builtIns);
  atoms = cleanTraceTemplate(atoms);
  atoms = renderTracePlaceholders(atoms, prompt, variableValues, builtIns, controlState.applicability);

  const segments = traceSegments(atoms);
  return segments.map((segment) => segment.text).join('') === expectedText
    ? { status: 'available', segments }
    : { status: 'unavailable', reason: 'segment-text-mismatch' };
}

function traceAtomsForTemplate(template: string): TraceAtom[] {
  const atoms: TraceAtom[] = [];
  for (const token of tokenizePromptTemplate(template)) {
    const sourceId = traceSourceId(token);
    for (let index = token.start; index < token.end; index += 1) {
      atoms.push({ character: template[index], sourceId, origins: [] });
    }
  }
  return atoms;
}

function traceSourceId(token: PromptTemplateToken): string {
  switch (token.kind) {
    case 'text':
      return `text:${token.start}`;
    case 'placeholder':
      return `placeholder:${token.start}:${token.name}`;
    case 'optionOpen':
      return `option:${token.start}:${token.optionId}`;
    case 'allOptionsDisabledOpen':
      return `all-options-disabled:${token.start}`;
    case 'whenOpen':
      return `when:${token.start}`;
    case 'modelOpen':
      return `model:${token.start}:${token.role}`;
    default:
      return `syntax:${token.start}`;
  }
}

function normalizeTraceLineEndings(atoms: TraceAtom[]): TraceAtom[] {
  const normalized: TraceAtom[] = [];
  for (let index = 0; index < atoms.length; index += 1) {
    const atom = atoms[index];
    if (atom.character !== '\r') {
      normalized.push(atom);
      continue;
    }
    normalized.push({ ...atom, character: '\n' });
    if (atoms[index + 1]?.character === '\n') index += 1;
  }
  return normalized;
}

function stripStandaloneTraceBlockTagLines(atoms: TraceAtom[]): TraceAtom[] {
  const text = traceText(atoms);
  const pattern = /^[ \t]*(\{\{[ \t]*(?:#option[ \t]+[A-Za-z_][A-Za-z0-9_]*|\/option|#allOptionsDisabled|\/allOptionsDisabled|#when(?:[ \t]+[A-Za-z_][A-Za-z0-9_]*)+|\/when)[ \t]*\}\})[ \t]*(?:\n|$)/gm;
  const deleted = new Set<number>();

  for (const match of text.matchAll(pattern)) {
    const matchStart = match.index;
    const tagOffset = match[0].indexOf(match[1]);
    const tagStart = matchStart + tagOffset;
    const tagEnd = tagStart + match[1].length;
    for (let index = matchStart; index < matchStart + match[0].length; index += 1) {
      if (index < tagStart || index >= tagEnd) deleted.add(index);
    }
  }

  return atoms.filter((_, index) => !deleted.has(index));
}

function renderTraceOptionBlocks(
  atoms: TraceAtom[],
  prompt: Prompt,
  controlState: PromptControlState
): TraceAtom[] {
  const fallbackOrigins = prompt.options
    .filter((option) => controlState.applicability.options[option.id]?.visible)
    .flatMap((option) => traceOriginsForOption(prompt, option));
  return renderTraceBlocks(atoms, (tokens) => pairTraceBlocks(
    tokens,
    (token): token is Extract<PromptTemplateToken, { kind: 'optionOpen' | 'allOptionsDisabledOpen' }> =>
      token.kind === 'optionOpen' || token.kind === 'allOptionsDisabledOpen',
    (token): token is Extract<PromptTemplateToken, { kind: 'optionClose' | 'allOptionsDisabledClose' }> =>
      token.kind === 'optionClose' || token.kind === 'allOptionsDisabledClose',
    (open) => open.kind === 'optionOpen'
      ? {
          enabled: Boolean(controlState.effectiveOptionValues[open.optionId]),
          origins: traceOriginsForOption(
            prompt,
            prompt.options.find((option) => option.id === open.optionId)
          )
        }
      : {
          enabled: controlState.allOptionsDisabled,
          origins: fallbackOrigins
        }
  ));
}

function renderTraceWhenBlocks(
  atoms: TraceAtom[],
  prompt: Prompt,
  variableValues: VariableValues,
  inactiveVariableNames: ReadonlySet<string>
): TraceAtom[] {
  return renderTraceBlocks(atoms, (tokens) => pairTraceBlocks(
    tokens,
    (token): token is Extract<PromptTemplateToken, { kind: 'whenOpen' }> => token.kind === 'whenOpen',
    (token): token is Extract<PromptTemplateToken, { kind: 'whenClose' }> => token.kind === 'whenClose',
    (open) => ({
      enabled: open.conditions.length > 0
        && open.conditions.every(({ variableName, choiceId }) =>
          !inactiveVariableNames.has(variableName) && variableValues[variableName] === choiceId
        ),
      origins: open.conditions.flatMap(({ variableName }) =>
        traceOriginsForVariable(prompt, variableName)
      )
    })
  ));
}

function renderTraceModelBlocks(atoms: TraceAtom[], builtIns: BuiltInValues): TraceAtom[] {
  return renderTraceBlocks(atoms, (tokens) => pairTraceBlocks(
    tokens,
    (token): token is Extract<PromptTemplateToken, { kind: 'modelOpen' }> => token.kind === 'modelOpen',
    (token): token is Extract<PromptTemplateToken, { kind: 'modelClose' }> => token.kind === 'modelClose',
    (open) => ({
      enabled: Boolean(builtIns[open.role]?.trim()),
      origins: [{ kind: 'model', role: open.role }]
    })
  ));
}

function pairTraceBlocks<
  TOpen extends TraceBlockOpen,
  TClose extends TraceBlockClose
>(
  tokens: PromptTemplateToken[],
  isOpen: (token: PromptTemplateToken) => token is TOpen,
  isClose: (token: PromptTemplateToken) => token is TClose,
  state: (open: TOpen) => Pick<TraceBlock, 'enabled' | 'origins'>
): TraceBlock[] {
  const stack: TOpen[] = [];
  const blocks: TraceBlock[] = [];
  for (const token of tokens) {
    if (isOpen(token)) {
      stack.push(token);
    } else if (isClose(token)) {
      const open = stack.pop();
      if (open) blocks.push({ open, close: token, ...state(open) });
    }
  }
  return blocks;
}

function renderTraceBlocks(
  atoms: TraceAtom[],
  blocksForTokens: (tokens: PromptTemplateToken[]) => TraceBlock[]
): TraceAtom[] {
  const blocks = blocksForTokens(tokenizePromptTemplate(traceText(atoms)));
  const deleted = new Set<number>();
  const addedOrigins = new Map<number, CompositionControlOrigin[]>();

  for (const block of blocks) {
    if (!block.enabled) {
      for (let index = block.open.start; index < block.close.end; index += 1) deleted.add(index);
      continue;
    }
    for (let index = block.open.start; index < block.open.end; index += 1) deleted.add(index);
    for (let index = block.close.start; index < block.close.end; index += 1) deleted.add(index);
    for (let index = block.open.end; index < block.close.start; index += 1) {
      addedOrigins.set(index, mergeOrigins(addedOrigins.get(index) ?? [], block.origins));
    }
  }

  const rendered: TraceAtom[] = [];
  for (let index = 0; index < atoms.length; index += 1) {
    if (deleted.has(index)) continue;
    const atom = atoms[index];
    const origins = addedOrigins.get(index);
    rendered.push(origins ? { ...atom, origins: mergeOrigins(atom.origins, origins) } : atom);
  }
  return rendered;
}

function cleanTraceTemplate(atoms: TraceAtom[]): TraceAtom[] {
  let cleaned = deleteTraceMatches(atoms, /^[ \t]+$/gm);
  const text = traceText(cleaned);
  const deleted = new Set<number>();
  for (const match of text.matchAll(/\n{3,}/g)) {
    for (let index = match.index + 2; index < match.index + match[0].length; index += 1) {
      deleted.add(index);
    }
  }
  cleaned = cleaned.filter((_, index) => !deleted.has(index));

  const cleanedText = traceText(cleaned);
  const start = cleanedText.length - cleanedText.trimStart().length;
  const end = cleanedText.trimEnd().length;
  return cleaned.slice(start, end);
}

function deleteTraceMatches(atoms: TraceAtom[], pattern: RegExp): TraceAtom[] {
  const deleted = new Set<number>();
  for (const match of traceText(atoms).matchAll(pattern)) {
    for (let index = match.index; index < match.index + match[0].length; index += 1) {
      deleted.add(index);
    }
  }
  return atoms.filter((_, index) => !deleted.has(index));
}

function renderTracePlaceholders(
  atoms: TraceAtom[],
  prompt: Prompt,
  variableValues: VariableValues,
  builtIns: BuiltInValues,
  applicability: PromptApplicability
): TraceAtom[] {
  const tokens = tokenizePromptTemplate(traceText(atoms));
  const placeholders = new Map(
    tokens
      .filter((token): token is Extract<PromptTemplateToken, { kind: 'placeholder' }> => token.kind === 'placeholder')
      .map((token) => [token.start, token])
  );
  const rendered: TraceAtom[] = [];

  for (let index = 0; index < atoms.length;) {
    const token = placeholders.get(index);
    if (!token) {
      rendered.push(atoms[index]);
      index += 1;
      continue;
    }

    const variable = prompt.variables.find((candidate) => candidate.name === token.name);
    const origin = variable
      ? traceOriginsForVariable(prompt, token.name)
      : isModelBuiltIn(token.name)
        ? [{ kind: 'model' as const, role: token.name }]
        : [];
    const value = isModelBuiltIn(token.name) && !builtIns[token.name]?.trim()
      ? `{{${token.name}}}`
      : variable
        ? isVariableActive(applicability, token.name)
          ? interpolatedVariableValue(variable, variableValues[token.name] ?? '')
          : ''
        : builtIns[token.name] ?? '';
    const source = atoms[token.start];
    const origins = mergeOrigins(source.origins, origin);
    for (let valueIndex = 0; valueIndex < value.length; valueIndex += 1) {
      rendered.push({
        character: value[valueIndex],
        sourceId: source.sourceId,
        origins
      });
    }
    index = token.end;
  }

  return rendered;
}

function traceSegments(atoms: TraceAtom[]): CompositionSegment[] {
  const segments: CompositionSegment[] = [];
  for (const atom of atoms) {
    const origins = mergeOrigins([], atom.origins);
    const previous = segments.at(-1);
    if (previous?.id === atom.sourceId && sameOrigins(previous.origins, origins)) {
      previous.text += atom.character;
    } else {
      segments.push({ id: atom.sourceId, text: atom.character, origins });
    }
  }
  return segments;
}

function mergeOrigins(
  left: CompositionControlOrigin[],
  right: CompositionControlOrigin[]
): CompositionControlOrigin[] {
  const origins = new Map<string, CompositionControlOrigin>();
  for (const origin of [...left, ...right]) origins.set(originKey(origin), origin);
  return [...origins.entries()]
    .sort(([leftKey], [rightKey]) => leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0)
    .map(([, origin]) => origin);
}

function traceOriginsForOption(
  prompt: Prompt,
  option: PromptOption | undefined
): CompositionControlOrigin[] {
  if (!option) return [];
  const dependencyNames = [
    ...Object.keys(option.visibleWhen ?? {}),
    ...Object.keys(option.enabledWhen ?? {})
  ];
  return mergeOrigins(
    [{ kind: 'option', id: option.id }],
    dependencyNames.flatMap((name) => traceOriginsForVariable(prompt, name))
  );
}

function traceOriginsForVariable(
  prompt: Prompt,
  name: string,
  visited: ReadonlySet<string> = new Set()
): CompositionControlOrigin[] {
  if (visited.has(name)) return [];
  const variable = prompt.variables.find((candidate) => candidate.name === name);
  if (!variable) return [];
  const nextVisited = new Set(visited).add(name);
  const dependencyNames = [
    ...Object.keys(variable.visibleWhen ?? {}),
    ...Object.keys(variable.enabledWhen ?? {})
  ];
  return mergeOrigins(
    [{ kind: 'variable', name }],
    dependencyNames.flatMap((dependencyName) =>
      traceOriginsForVariable(prompt, dependencyName, nextVisited)
    )
  );
}

function sameOrigins(left: CompositionControlOrigin[], right: CompositionControlOrigin[]): boolean {
  return left.length === right.length
    && left.every((origin, index) => originKey(origin) === originKey(right[index]));
}

function originKey(origin: CompositionControlOrigin): string {
  switch (origin.kind) {
    case 'variable':
      return `variable:${origin.name}`;
    case 'option':
      return `option:${origin.id}`;
    case 'model':
      return `model:${origin.role}`;
  }
}

function traceText(atoms: TraceAtom[]): string {
  return atoms.map((atom) => atom.character).join('');
}

function renderPromptWorkflowTemplate(
  prompt: Prompt,
  optionValues: OptionValues,
  variableValues: VariableValues,
  controlState = resolvePromptControlState(prompt, variableValues, optionValues)
): string {
  return renderPromptTemplateControls(
    prompt.template,
    controlState.effectiveOptionValues,
    controlState.allOptionsDisabled,
    variableValues,
    controlState.inactiveConditionVariableNames
  );
}

function isVariableActive(applicability: PromptApplicability, name: string): boolean {
  const state = applicability.variables[name];
  return Boolean(state?.visible && state.enabled);
}

function interpolatedVariableValue(variable: PromptVariable, rawValue: string): string {
  if (variable.control !== 'select' && variable.control !== 'slider') {
    return rawValue;
  }
  const choice = variable.choices?.find((candidate) => candidate.id === rawValue);
  return choice?.value ?? choice?.label ?? rawValue;
}

function validationBlockersForPrompt(
  prompt: Prompt,
  issues: ValidationIssue[],
  usesAnyModelPlaceholder: boolean,
  usesSelectedOrRequiredModel: boolean,
  requiresDefaultModel: boolean
): string[] {
  return issues
    .filter((issue) => {
      if (issue.scope === 'global') return true;
      if (issue.scope === 'preset') return usesSelectedOrRequiredModel;
      if (isDefaultModelIssue(issue) && !requiresDefaultModel) return false;
      if (!usesAnyModelPlaceholder && isDefaultModelIssue(issue)) return false;
      return issueAppliesToPrompt(issue, prompt);
    })
    .map((issue) => `${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
}

function isModelBuiltIn(name: string): name is typeof modelBuiltIns[number] {
  return modelBuiltIns.includes(name as typeof modelBuiltIns[number]);
}

function modelBuiltInLabel(name: typeof modelBuiltIns[number]): string {
  return name === 'rubberDuckModel' ? 'alternative model preset' : 'general model preset';
}

function issueAppliesToPrompt(issue: ValidationIssue, prompt: Prompt): boolean {
  const qualifiedKeys = [
    ...(typeof issue.promptKey === 'string' ? [issue.promptKey] : []),
    ...(Array.isArray(issue.promptKeys) ? issue.promptKeys : [])
  ].filter((key) => key.length > 0);
  if (qualifiedKeys.length > 0) {
    return qualifiedKeys.includes(prompt.key);
  }
  return issue.path === prompt.path || issue.paths?.includes(prompt.path) === true || issue.promptPaths?.includes(prompt.path) === true;
}

function isDefaultModelIssue(issue: ValidationIssue): boolean {
  return /^Default model preset ".+" does not exist\.$/.test(issue.message);
}
