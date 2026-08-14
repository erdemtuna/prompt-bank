import { Input, Select, Slider, Text, Textarea, Tooltip, makeStyles } from '@fluentui/react-components';
import { CheckmarkRegular, CheckmarkCircleRegular, ErrorCircleRegular, InfoRegular } from '@fluentui/react-icons';
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { composeModelLabel, composePrompt, initialOptionValues, initialVariableValues, normalizeOptionValues, promptUsesModelPlaceholder, promptUsesRubberDuckModelPlaceholder, type OptionValues, type VariableValues } from '../data/composer';
import type { ModelPreset, ModelPresetVariant, Prompt, PromptOption, PromptVariable, ValidationIssue } from '../data/schemas';
import { formatCount, shortcutModifier, shouldUseTextarea } from './promptUi';

const useStyles = makeStyles({
  panel: {
    display: 'grid',
    gap: '22px',
    containerName: 'composer-panel',
    containerType: 'inline-size',
    '@media (min-width: 1101px)': {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      gap: '20px'
    }
  },
  header: {
    display: 'grid',
    gap: '10px',
    flexShrink: 0
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  title: {
    margin: 0,
    fontFamily: 'var(--sw-sans)',
    fontWeight: 700,
    fontSize: 'clamp(22px, 2.2vw, 30px)',
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    color: 'var(--sw-ink)'
  },
  metaRow: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: '14px',
    alignItems: 'center'
  },
  metaItem: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  metaDot: {
    width: '4px',
    height: '4px',
    backgroundColor: 'var(--sw-rule-strong)',
    borderRadius: '50%'
  },
  workspace: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) clamp(340px, 27vw, 380px)',
    gap: '28px',
    alignItems: 'start',
    borderTop: '1px solid var(--sw-rule)',
    paddingTop: '20px',
    '@media (min-width: 1101px)': {
      flex: 1,
      minHeight: 0,
      alignItems: 'stretch'
    },
    '@media (max-width: 1100px)': {
      gridTemplateColumns: '1fr',
      gap: '28px'
    },
    '@container (max-width: 707px)': {
      gridTemplateColumns: '1fr',
      alignItems: 'start',
      overflowX: 'hidden',
      overflowY: 'auto'
    }
  },
  previewColumn: {
    display: 'grid',
    gap: '14px',
    minWidth: 0,
    '@media (min-width: 1101px)': {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
    },
    '@container (max-width: 707px)': {
      display: 'grid',
      minHeight: 'auto'
    }
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '16px',
    flexShrink: 0
  },
  copyButton: {
    appearance: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '12px',
    border: 'none',
    borderRadius: 0,
    padding: '14px 22px',
    backgroundColor: 'var(--sw-ink)',
    color: '#ffffff',
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    transitionProperty: 'background-color, transform',
    transitionDuration: '120ms',
    ':hover': {
      backgroundColor: 'var(--sw-accent)'
    },
    ':active': {
      transform: 'translateY(1px)'
    },
    ':focus-visible': {
      outline: '2px solid var(--sw-accent)',
      outlineOffset: '3px'
    },
    ':disabled': {
      cursor: 'not-allowed',
      backgroundColor: 'var(--sw-fill)',
      color: 'var(--sw-muted)'
    }
  },
  copyArrow: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '14px'
  },
  feedback: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    letterSpacing: '0.04em'
  },
  feedbackOk: {
    color: 'var(--sw-ink)'
  },
  feedbackErr: {
    color: 'var(--sw-accent-strong)'
  },
  disabledReason: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.06em',
    color: 'var(--sw-muted)'
  },
  shortcutHint: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)',
    whiteSpace: 'nowrap',
    '@media (max-width: 900px)': { display: 'none' }
  },
  previewFrame: {
    display: 'grid',
    gap: '10px',
    '@media (min-width: 1101px)': {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column'
    },
    '@container (max-width: 707px)': {
      display: 'grid',
      flex: 'initial',
      minHeight: 'auto'
    }
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexShrink: 0
  },
  previewLabel: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  previewMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  charCount: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    letterSpacing: '0.08em',
    color: 'var(--sw-muted)',
    fontVariantNumeric: 'tabular-nums'
  },
  preview: {
    margin: 0,
    minHeight: 'clamp(260px, 46vh, 560px)',
    maxHeight: 'min(70vh, 720px)',
    overflow: 'auto',
    padding: '22px 24px',
    backgroundColor: 'var(--sw-panel)',
    border: '1px solid var(--sw-rule)',
    borderLeft: '2px solid var(--sw-ink)',
    color: 'var(--sw-ink)',
    fontFamily: 'var(--sw-mono)',
    fontSize: '13px',
    lineHeight: 1.65,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    userSelect: 'text',
    '@media (min-width: 1101px)': {
      flex: 1,
      minHeight: 0,
      maxHeight: 'none'
    },
    '@container (max-width: 707px)': {
      flex: 'initial',
      minHeight: 'clamp(260px, 46vh, 560px)',
      maxHeight: 'min(70vh, 720px)'
    }
  },
  rail: {
    display: 'grid',
    gap: '24px',
    alignContent: 'start',
    minWidth: 0,
    containerType: 'inline-size',
    '@media (min-width: 1101px)': {
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: '4px',
      paddingBottom: '8px'
    },
    '@container (max-width: 707px)': {
      minHeight: 'auto',
      overflow: 'visible',
      paddingRight: 0,
      paddingBottom: 0
    }
  },
  section: {
    display: 'grid',
    gap: '16px'
  },
  eyebrow: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--sw-ink)',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--sw-rule)'
  },
  optionList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '6px 16px',
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr'
    }
  },
  checkRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    minWidth: 0,
    '& > [data-help-trigger]': {
      marginTop: '6px'
    }
  },
  check: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    gap: '12px',
    cursor: 'pointer',
    userSelect: 'none',
    padding: '6px 0',
    minWidth: 0,
    '& input:checked + span': {
      backgroundColor: 'var(--sw-accent)',
      border: '1.5px solid var(--sw-accent)',
      color: '#ffffff'
    },
    '& input:focus-visible + span': {
      outline: '2px solid var(--sw-accent)',
      outlineOffset: '2px'
    },
    ':hover span[data-box]': {
      border: '1.5px solid var(--sw-ink)'
    },
    '& input:disabled + span': {
      border: '1.5px solid var(--sw-rule)',
      backgroundColor: 'var(--sw-fill)',
      color: 'transparent'
    }
  },
  checkDisabled: {
    cursor: 'not-allowed',
    opacity: 0.58,
    ':hover span[data-box]': {
      border: '1.5px solid var(--sw-rule)'
    }
  },
  checkInput: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0
  },
  checkBox: {
    flexShrink: 0,
    width: '18px',
    height: '18px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid var(--sw-rule-strong)',
    backgroundColor: 'transparent',
    color: 'transparent',
    fontSize: '13px',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '120ms',
    transitionTimingFunction: 'ease'
  },
  checkText: {
    minWidth: 0,
    fontFamily: 'var(--sw-sans)',
    fontSize: '14px',
    lineHeight: 1.3,
    color: 'var(--sw-ink)'
  },
  fields: {
    display: 'grid',
    gap: '20px'
  },
  workflowFields: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '18px',
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr'
    },
    '@container (max-width: 350px)': {
      gridTemplateColumns: '1fr'
    },
    '@container composer-panel (max-width: 707px)': {
      gridTemplateColumns: '1fr'
    }
  },
  modelGroups: {
    display: 'grid',
    gap: 0,
    '& > [data-model-card] + [data-model-card]': {
      borderTop: '1px solid var(--sw-rule)',
      marginTop: '16px',
      paddingTop: '16px'
    }
  },
  modelCard: {
    display: 'grid',
    gap: '12px',
    minWidth: 0
  },
  modelHeader: {
    minWidth: 0
  },
  modelRole: {
    fontFamily: 'var(--sw-sans)',
    fontSize: '14px',
    fontWeight: 700,
    lineHeight: 1.3,
    color: 'var(--sw-ink)'
  },
  modelGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(112px, 1.2fr) minmax(72px, 0.75fr) minmax(104px, 1fr)',
    gap: '8px',
    alignItems: 'end',
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
      alignItems: 'stretch'
    },
    '@container (max-width: 303px)': {
      gridTemplateColumns: '1fr',
      alignItems: 'stretch'
    }
  },
  variantField: {
    display: 'grid',
    gap: '6px',
    minWidth: 0
  },
  variantLabel: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  field: {
    display: 'grid',
    gap: '8px',
    minWidth: 0
  },
  helpLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    width: 'fit-content',
    maxWidth: '100%'
  },
  titleHelpLabel: {
    alignItems: 'baseline'
  },
  labelText: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)'
  },
  req: {
    color: 'var(--sw-accent-strong)',
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px'
  },
  fieldError: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--sw-accent-strong)'
  },
  underlineField: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    '& input': {
      minWidth: 0,
      maxWidth: '100%',
      fontFamily: 'var(--sw-sans)',
      fontSize: '14px',
      color: 'var(--sw-ink)'
    },
    '& select': {
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
      fontFamily: 'var(--sw-sans)',
      fontSize: '14px',
      color: 'var(--sw-ink)'
    }
  },
  textareaField: {
    width: '100%',
    borderRadius: 0,
    '& textarea': {
      fontFamily: 'var(--sw-sans)',
      fontSize: '14px',
      lineHeight: 1.5,
      color: 'var(--sw-ink)'
    }
  },
  sliderControl: {
    display: 'grid',
    gap: '6px'
  },
  slider: {
    width: '100%'
  },
  sliderValue: {
    fontFamily: 'var(--sw-sans)',
    fontSize: '14px',
    color: 'var(--sw-ink)'
  },
  emptyInputs: {
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    letterSpacing: '0.04em',
    color: 'var(--sw-muted)'
  },
  rawDetails: {
    display: 'grid',
    gap: '12px',
    borderTop: '1px solid var(--sw-rule)',
    paddingTop: '16px'
  },
  rawSummary: {
    cursor: 'pointer',
    fontFamily: 'var(--sw-mono)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--sw-muted)',
    ':hover': {
      color: 'var(--sw-ink)'
    }
  },
  rawTemplate: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflow: 'auto',
    maxHeight: '220px',
    padding: '16px',
    backgroundColor: 'var(--sw-fill)',
    fontFamily: 'var(--sw-mono)',
    fontSize: '12px',
    lineHeight: 1.6,
    color: 'var(--sw-ink)'
  },
  infoTrigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '17px',
    height: '17px',
    border: 'none',
    background: 'none',
    padding: 0,
    color: 'var(--sw-muted)',
    fontSize: '16px',
    cursor: 'help',
    ':hover': {
      color: 'var(--sw-accent-strong)'
    },
    ':focus-visible': {
      outline: '2px solid var(--sw-accent)',
      outlineOffset: '2px'
    }
  },
  tooltipContent: {
    maxWidth: '260px',
    padding: '8px 10px',
    border: 'none',
    borderRadius: '2px',
    backgroundColor: 'var(--sw-ink)',
    color: '#ffffff',
    fontFamily: 'var(--sw-sans)',
    fontSize: '12px',
    lineHeight: 1.45,
    whiteSpace: 'normal',
    filter: 'drop-shadow(0 4px 10px rgba(21, 20, 15, 0.2))'
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0
  }
});

type Props = {
  prompt?: Prompt;
  presets: ModelPreset[];
  issues: ValidationIssue[];
};

function variantOptionText(variant: ModelPresetVariant, kind: 'context' | 'reasoning'): string {
  const label = variant.label.trim();
  // The group already names the axis, so drop a trailing "context" or "reasoning"
  // from the option text. The full label is still what gets copied.
  const trimmed = label.toLowerCase().endsWith(` ${kind}`) ? label.slice(0, -(kind.length + 1)).trim() : label;
  if (trimmed) return trimmed;
  return variant.id.charAt(0).toUpperCase() + variant.id.slice(1);
}

function variantSelection(variants: ModelPresetVariant[] | undefined, defaultId: string | undefined, current: string): string {
  if (!variants || variants.length === 0) return '';
  if (variants.some((variant) => variant.id === current)) return current;
  return defaultId ?? variants[0].id;
}

type ModelGroupProps = {
  styles: ComposerStyles;
  slotName: 'General' | 'Alternative';
  roleLabel: string;
  roleDescription: string;
  presets: ModelPreset[];
  presetId: string;
  preset: ModelPreset | undefined;
  contextId: string;
  reasoningId: string;
  placeholder: string;
  onPresetChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
};

function ModelGroup({
  styles,
  slotName,
  roleLabel,
  roleDescription,
  presets,
  presetId,
  preset,
  contextId,
  reasoningId,
  placeholder,
  onPresetChange,
  onContextChange,
  onReasoningChange
}: ModelGroupProps) {
  const roleLabelId = useId();
  const roleDescriptionId = useId();
  const contexts = preset?.contexts ?? [];
  const reasoning = preset?.reasoning ?? [];

  return (
    <div
      className={styles.modelCard}
      data-model-card
      role="group"
      aria-labelledby={roleLabelId}
      aria-describedby={roleDescription ? roleDescriptionId : undefined}
    >
      <div className={styles.modelHeader}>
        <HelpLabel
          styles={styles}
          helpText={roleDescription}
          triggerLabel={`About ${roleLabel}`}
        >
          <strong id={roleLabelId} className={styles.modelRole}>{roleLabel}</strong>
        </HelpLabel>
        <span id={roleDescriptionId} className={styles.visuallyHidden}>{roleDescription}</span>
      </div>
      <div className={styles.modelGrid}>
        <div className={styles.variantField} data-model-field="model">
          <span className={styles.variantLabel}>Model</span>
          <Select
            appearance="underline"
            className={styles.underlineField}
            aria-label={`${slotName} model`}
            value={presetId}
            disabled={presets.length === 0}
            onChange={(_, data) => onPresetChange(data.value)}
          >
            {presetId ? null : <option value="">{placeholder}</option>}
            {presets.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
        </div>
        {contexts.length > 0 ? (
          <div className={styles.variantField} data-model-field="context">
            <span className={styles.variantLabel}>Context</span>
            <Select
              appearance="underline"
              className={styles.underlineField}
              aria-label={`${slotName} context`}
              value={contextId}
              onChange={(_, data) => onContextChange(data.value)}
            >
              {contexts.map((variant) => (
                <option key={variant.id} value={variant.id}>{variantOptionText(variant, 'context')}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {reasoning.length > 0 ? (
          <div className={styles.variantField} data-model-field="reasoning">
            <span className={styles.variantLabel}>Reasoning</span>
            <DiscreteSlider
              label={`${slotName} reasoning`}
              value={reasoningId}
              choices={reasoning.map((variant) => ({
                id: variant.id,
                label: variantOptionText(variant, 'reasoning')
              }))}
              styles={styles}
              onChange={onReasoningChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatChoiceList(labels: string[]): string {
  if (labels.length < 2) return labels[0] ?? '';
  if (labels.length === 2) return labels.join(' or ');
  return `${labels.slice(0, -1).join(', ')}, or ${labels.at(-1)}`;
}

function availabilityExplanation(prompt: Prompt, option: PromptOption): string {
  const requirements = Object.entries(option.enabledWhen ?? {}).map(([name, choiceIds]) => {
    const variable = prompt.variables.find((candidate) => candidate.name === name);
    const labels = choiceIds.map((id) => variable?.choices?.find((choice) => choice.id === id)?.label ?? id);
    return `${variable?.label ?? name} is ${formatChoiceList(labels)}`;
  });
  return requirements.length > 0
    ? `Available when ${requirements.join(' and ')}.`
    : 'Unavailable for the current workflow selections.';
}

function OptionControl({
  prompt,
  option,
  checked,
  disabled,
  styles,
  onChange
}: {
  prompt: Prompt;
  option: PromptOption;
  checked: boolean;
  disabled: boolean;
  styles: ComposerStyles;
  onChange: (checked: boolean) => void;
}) {
  const reasonId = useId();
  const reason = disabled ? availabilityExplanation(prompt, option) : undefined;
  const helpText = [option.description, reason].filter(Boolean).join(' ');

  return (
    <div className={styles.checkRow} data-option-control={option.id}>
      <label className={`${styles.check} ${disabled ? styles.checkDisabled : ''}`}>
        <input
          type="checkbox"
          className={styles.checkInput}
          checked={checked}
          disabled={disabled}
          aria-describedby={reason ? reasonId : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.checkBox} data-box aria-hidden="true"><CheckmarkRegular /></span>
        <span className={styles.checkText}>{option.label}</span>
      </label>
      {helpText ? <HelpTooltip text={helpText} triggerLabel={`About ${option.label}`} styles={styles} /> : null}
      {reason ? <span id={reasonId} className={styles.visuallyHidden}>{reason}</span> : null}
    </div>
  );
}

export function Composer({ prompt, presets, issues }: Props) {
  const styles = useStyles();
  const [modelId, setModelId] = useState<string>('');
  const [rubberDuckModelId, setRubberDuckModelId] = useState<string>('');
  const [modelContextId, setModelContextId] = useState<string>('');
  const [modelReasoningId, setModelReasoningId] = useState<string>('');
  const [rubberDuckContextId, setRubberDuckContextId] = useState<string>('');
  const [rubberDuckReasoningId, setRubberDuckReasoningId] = useState<string>('');
  const [values, setValues] = useState<VariableValues>({});
  const [optionValues, setOptionValues] = useState<OptionValues>({});
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | undefined>();

  // Reset when the selected prompt's definition changes, using a stable signature
  // over its key and content. This is stable across a data recompute (a global
  // load or tab switch re-parses the same file to a new object with the same
  // signature, so input is preserved), but changes when the file content itself
  // changes (for example re-picking the same folder after edits), so defaults
  // refresh. The presets signature ignores array identity for the same reason.
  const presetSignature = presets.map((preset) => `${preset.id}:${preset.contexts.map((v) => v.id).join(',')}:${preset.reasoning.map((v) => v.id).join(',')}`).join('|');
  const promptSignature = prompt
    ? [prompt.key, prompt.template, JSON.stringify(prompt.variables), JSON.stringify(prompt.options), JSON.stringify(prompt.modelRoles), prompt.defaultModelId ?? ''].join('\u0000')
    : '';

  useEffect(() => {
    if (!prompt) {
      setValues({});
      setOptionValues({});
      setModelId('');
      setRubberDuckModelId('');
      return;
    }
    const defaultModelId = prompt.defaultModelId && presets.some((preset) => preset.id === prompt.defaultModelId) ? prompt.defaultModelId : presets[0]?.id ?? '';
    const initialValues = initialVariableValues(prompt.variables);
    setValues(initialValues);
    setOptionValues(normalizeOptionValues(prompt, initialValues, initialOptionValues(prompt.options)));
    setModelId(promptUsesModelPlaceholder(prompt) ? defaultModelId : '');
    setRubberDuckModelId(promptUsesRubberDuckModelPlaceholder(prompt) ? defaultModelId : '');
    setFeedback(undefined);
  }, [promptSignature, presetSignature]);

  const selectedPreset = useMemo(() => presets.find((preset) => preset.id === modelId), [modelId, presets]);
  const selectedRubberDuckPreset = useMemo(() => presets.find((preset) => preset.id === rubberDuckModelId), [rubberDuckModelId, presets]);
  const defaultModelId = prompt?.defaultModelId && presets.some((preset) => preset.id === prompt.defaultModelId)
    ? prompt.defaultModelId
    : presets[0]?.id ?? '';

  // Keep each model's context and reasoning selection valid for the preset that
  // is actually selected. Presets may offer different variants, so a stale id is
  // replaced by that preset's default rather than left dangling.
  useEffect(() => {
    setModelContextId((current) => variantSelection(selectedPreset?.contexts, selectedPreset?.defaultContextId, current));
    setModelReasoningId((current) => variantSelection(selectedPreset?.reasoning, selectedPreset?.defaultReasoningId, current));
  }, [selectedPreset]);

  useEffect(() => {
    setRubberDuckContextId((current) => variantSelection(selectedRubberDuckPreset?.contexts, selectedRubberDuckPreset?.defaultContextId, current));
    setRubberDuckReasoningId((current) => variantSelection(selectedRubberDuckPreset?.reasoning, selectedRubberDuckPreset?.defaultReasoningId, current));
  }, [selectedRubberDuckPreset]);

  const modelLabel = useMemo(
    () => composeModelLabel(selectedPreset, modelContextId, modelReasoningId),
    [selectedPreset, modelContextId, modelReasoningId]
  );
  const rubberDuckLabel = useMemo(
    () => composeModelLabel(selectedRubberDuckPreset, rubberDuckContextId, rubberDuckReasoningId),
    [selectedRubberDuckPreset, rubberDuckContextId, rubberDuckReasoningId]
  );
  const composition = useMemo(
    () => prompt ? composePrompt(prompt, values, { model: modelLabel, rubberDuckModel: rubberDuckLabel }, { validationIssues: issues, optionValues }) : undefined,
    [issues, optionValues, prompt, modelLabel, rubberDuckLabel, values]
  );
  const visibleVariables = useMemo(() => {
    if (!prompt) return [];
    if (!composition) return prompt.variables;
    const activeVariableNames = new Set(composition.activeVariableNames);
    return prompt.variables.filter((variable) => {
      const state = composition.applicability.variables[variable.name];
      return Boolean(state?.visible && (!state.enabled || activeVariableNames.has(variable.name)));
    });
  }, [composition, prompt]);
  const workflowVariables = useMemo(
    () => visibleVariables.filter((variable) => variable.control === 'select' || variable.control === 'slider'),
    [visibleVariables]
  );
  const contextVariables = useMemo(
    () => visibleVariables.filter((variable) => variable.control !== 'select' && variable.control !== 'slider'),
    [visibleVariables]
  );
  const visibleOptions = useMemo(() => {
    if (!prompt) return [];
    if (!composition) return prompt.options;
    return prompt.options.filter((option) => composition.applicability.options[option.id]?.visible);
  }, [composition, prompt]);
  const usesModel = composition?.usesModelPlaceholder;
  const usesRubberDuck = composition?.usesRubberDuckModelPlaceholder;

  function updateVariable(name: string, nextValue: string) {
    if (!prompt) return;
    const nextValues = { ...values, [name]: nextValue };
    setValues(nextValues);
    setOptionValues((current) => normalizeOptionValues(prompt, nextValues, current));
  }

  const isCommand = prompt?.kind === 'command';

  // Copying is also bound to Ctrl/Cmd+Enter, so the handler lives in a callback
  // above the early return where the keyboard effect can reach it.
  const copyComposedPrompt = useCallback(async () => {
    if (!composition?.canCopy) {
      setFeedback({ kind: 'error', message: composition?.disabledReasons[0] ?? `Copy is disabled for this ${isCommand ? 'command' : 'prompt'}.` });
      return;
    }
    try {
      await navigator.clipboard.writeText(composition.text);
      setFeedback({ kind: 'success', message: isCommand ? 'Command copied.' : 'Prompt copied.' });
    } catch {
      setFeedback({ kind: 'error', message: `Could not copy. Select and copy the text from the ${isCommand ? 'command' : 'prompt'} preview.` });
    }
  }, [composition, isCommand]);

  // Ctrl/Cmd+Enter copies from anywhere in the composer, including from inside a
  // variable field, so filling the last input and copying needs no mouse.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      void copyComposedPrompt();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copyComposedPrompt]);

  useEffect(() => {
    if (usesModel && !modelId) setModelId(defaultModelId);
    if (usesRubberDuck && !rubberDuckModelId) setRubberDuckModelId(defaultModelId);
  }, [defaultModelId, modelId, rubberDuckModelId, usesModel, usesRubberDuck]);

  if (!prompt) {
    return <Text className={styles.emptyInputs}>Select a prompt to compose it.</Text>;
  }

  const copyDisabled = !composition?.canCopy;
  const previewText = composition?.text ?? '';
  const charCount = previewText.length;
  const copyLabel = isCommand ? 'Copy command' : 'Copy composed prompt';
  const previewLabel = isCommand ? 'Composed command' : 'Composed prompt';
  const rawTemplateLabel = isCommand ? 'Raw command template' : 'Raw template';

  const metaItems = [prompt.category];
  if (isCommand) metaItems.push('command');
  metaItems.push(visibleVariables.length > 0 ? formatCount(visibleVariables.length, 'input') : 'no inputs');


  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <HelpLabel
            styles={styles}
            className={styles.titleHelpLabel}
            helpText={prompt.description}
            triggerLabel="About this prompt"
          >
            <h2 className={styles.title}>{prompt.title}</h2>
          </HelpLabel>
          <span className={styles.metaRow}>
            {metaItems.map((item, index) => (
              <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: '14px' }}>
                {index > 0 ? <span className={styles.metaDot} aria-hidden="true" /> : null}
                <span className={styles.metaItem}>{item}</span>
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className={styles.workspace}>
        <div className={styles.previewColumn}>
          <div className={styles.actions}>
            <button type="button" className={styles.copyButton} disabled={copyDisabled} onClick={copyComposedPrompt}>
              <span className={styles.copyArrow} aria-hidden="true">→</span>
              {copyLabel}
            </button>
            {feedback ? (
              <span aria-live="polite" className={`${styles.feedback} ${feedback.kind === 'success' ? styles.feedbackOk : styles.feedbackErr}`}>
                {feedback.kind === 'success' ? <CheckmarkCircleRegular /> : <ErrorCircleRegular />}
                {feedback.message}
              </span>
            ) : copyDisabled ? null : (
              <span className={styles.shortcutHint}>{shortcutModifier} + Enter</span>
            )}
          </div>
          {composition && composition.disabledReasons.length > 0 ? (
            <Text className={styles.disabledReason}>Copy disabled — {composition.disabledReasons.join(' ')}</Text>
          ) : null}

          <section className={styles.previewFrame} aria-label={previewLabel}>
            <div className={styles.previewHeader}>
              <span className={styles.previewLabel}>{previewLabel}</span>
              <div className={styles.previewMeta}>
                {charCount > 0 ? <span className={styles.charCount}>{formatCount(charCount, 'char')}</span> : null}
              </div>
            </div>
            <pre className={styles.preview} tabIndex={0}>{previewText}</pre>
          </section>
        </div>

        <aside className={styles.rail} aria-label="Prompt inputs">
          {workflowVariables.length > 0 ? (
            <section className={styles.section} aria-label="Workflow">
              <span className={styles.eyebrow}>Workflow</span>
              <div className={styles.workflowFields}>
                {workflowVariables.map((variable) => (
                  <Field
                    key={variable.name}
                    variable={variable}
                    value={values[variable.name] ?? ''}
                    invalid={Boolean(composition?.missingRequired.includes(variable.name))}
                    disabled={!composition?.applicability.variables[variable.name]?.enabled}
                    styles={styles}
                    onChange={(next) => updateVariable(variable.name, next)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {visibleOptions.length > 0 ? (
            <section className={styles.section} aria-label="Focus areas">
              <span className={styles.eyebrow}>Focus areas</span>
              <div className={styles.optionList}>
                {visibleOptions.map((option) => {
                  const optionState = composition?.applicability.options[option.id];
                  return (
                    <OptionControl
                      key={option.id}
                      prompt={prompt}
                      option={option}
                      checked={Boolean(composition?.effectiveOptionValues[option.id])}
                      disabled={!optionState?.enabled}
                      styles={styles}
                      onChange={(checked) => setOptionValues((current) => ({ ...current, [option.id]: checked }))}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {usesModel || usesRubberDuck ? (
            <section className={styles.section} aria-label="Model guidance">
              <span className={styles.eyebrow}>Model guidance</span>
              <div className={styles.modelGroups}>
                {usesModel ? (
                  <ModelGroup
                    styles={styles}
                    slotName="General"
                    roleLabel={prompt.modelRoles?.model?.label ?? 'General model'}
                    roleDescription={prompt.modelRoles?.model?.description ?? 'Used by the primary model placeholder in this prompt.'}
                    presets={presets}
                    presetId={modelId}
                    preset={selectedPreset}
                    contextId={modelContextId}
                    reasoningId={modelReasoningId}
                    placeholder="Select a model preset"
                    onPresetChange={setModelId}
                    onContextChange={setModelContextId}
                    onReasoningChange={setModelReasoningId}
                  />
                ) : null}
                {usesRubberDuck ? (
                  <ModelGroup
                    styles={styles}
                    slotName="Alternative"
                    roleLabel={prompt.modelRoles?.rubberDuckModel?.label ?? 'Alternative model'}
                    roleDescription={prompt.modelRoles?.rubberDuckModel?.description ?? 'Used by the alternative model placeholder in this prompt.'}
                    presets={presets}
                    presetId={rubberDuckModelId}
                    preset={selectedRubberDuckPreset}
                    contextId={rubberDuckContextId}
                    reasoningId={rubberDuckReasoningId}
                    placeholder="Select an alternative model preset"
                    onPresetChange={setRubberDuckModelId}
                    onContextChange={setRubberDuckContextId}
                    onReasoningChange={setRubberDuckReasoningId}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          {contextVariables.length > 0 ? (
            <section className={styles.section} aria-label="Context">
              <span className={styles.eyebrow}>Context</span>
              <div className={styles.fields}>
                {contextVariables.map((variable) => (
                  <Field
                    key={variable.name}
                    variable={variable}
                    value={values[variable.name] ?? ''}
                    invalid={Boolean(composition?.missingRequired.includes(variable.name))}
                    disabled={!composition?.applicability.variables[variable.name]?.enabled}
                    styles={styles}
                    onChange={(next) => updateVariable(variable.name, next)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <details className={styles.rawDetails}>
            <summary className={styles.rawSummary}>{rawTemplateLabel}</summary>
            <pre className={styles.rawTemplate}>{prompt.template}</pre>
          </details>
        </aside>
      </div>
    </div>
  );
}

type ComposerStyles = ReturnType<typeof useStyles>;

function Field({ variable, value, invalid, disabled, styles, onChange }: { variable: PromptVariable; value: string; invalid: boolean; disabled: boolean; styles: ComposerStyles; onChange: (value: string) => void }) {
  const errorId = useId();
  const choices = variable.choices ?? [];
  return (
    <div className={styles.field}>
      <HelpLabel
        styles={styles}
        helpText={variable.description}
        triggerLabel={`About ${variable.label}`}
      >
        <span className={styles.labelText}>{variable.label}</span>
        {variable.required ? <span className={styles.req} aria-hidden="true">*</span> : null}
      </HelpLabel>
      {variable.control === 'select' ? (
        <Select
          appearance="underline"
          className={styles.underlineField}
          value={value}
          aria-label={variable.label}
          aria-required={variable.required}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          disabled={disabled}
          onChange={(_, data) => onChange(data.value)}
        >
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>{choice.label}</option>
          ))}
        </Select>
      ) : variable.control === 'slider' ? (
        <DiscreteSlider
          label={variable.label}
          value={value}
          choices={choices}
          invalid={invalid}
          disabled={disabled}
          describedBy={invalid ? errorId : undefined}
          styles={styles}
          onChange={onChange}
        />
      ) : shouldUseTextarea(variable) ? (
        <Textarea
          className={styles.textareaField}
          resize="vertical"
          value={value}
          aria-label={variable.label}
          aria-required={variable.required}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          disabled={disabled}
          onChange={(_, data) => onChange(data.value)}
        />
      ) : (
        <Input
          appearance="underline"
          className={styles.underlineField}
          value={value}
          aria-label={variable.label}
          aria-required={variable.required}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          disabled={disabled}
          onChange={(_, data) => onChange(data.value)}
        />
      )}
      {invalid ? <span id={errorId} role="alert" className={styles.fieldError}>{variable.label} is required</span> : null}
    </div>
  );
}

function DiscreteSlider({
  label,
  value,
  choices,
  invalid,
  disabled,
  describedBy,
  styles,
  onChange
}: {
  label: string;
  value: string;
  choices: Array<{ id: string; label: string }>;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  styles: ComposerStyles;
  onChange: (value: string) => void;
}) {
  const selectedIndex = Math.max(0, choices.findIndex((choice) => choice.id === value));
  const selected = choices[selectedIndex];

  return (
    <div className={styles.sliderControl}>
      <Slider
        className={styles.slider}
        min={0}
        max={Math.max(0, choices.length - 1)}
        step={1}
        value={selectedIndex}
        aria-label={label}
        aria-valuetext={selected?.label ?? ''}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled || choices.length < 2}
        onChange={(_, data) => {
          const choice = choices[data.value];
          if (choice) onChange(choice.id);
        }}
      />
      <span className={styles.sliderValue}>{selected?.label ?? ''}</span>
    </div>
  );
}

function HelpLabel({
  children,
  helpText,
  triggerLabel,
  styles,
  className
}: {
  children: ReactNode;
  helpText?: string;
  triggerLabel: string;
  styles: ComposerStyles;
  className?: string;
}) {
  return (
    <div className={`${styles.helpLabel} ${className ?? ''}`}>
      {children}
      {helpText ? <HelpTooltip text={helpText} triggerLabel={triggerLabel} styles={styles} /> : null}
    </div>
  );
}

function HelpTooltip({ text, triggerLabel, styles }: { text: string; triggerLabel: string; styles: ComposerStyles }) {
  return (
    <Tooltip
      content={{ children: text, className: styles.tooltipContent }}
      relationship="description"
      positioning={{ position: 'above', align: 'center', offset: 8 }}
      withArrow
    >
      <button type="button" className={styles.infoTrigger} aria-label={triggerLabel} data-help-trigger>
        <InfoRegular aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
