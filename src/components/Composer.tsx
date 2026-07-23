import { Input, Select, Text, Textarea, makeStyles } from '@fluentui/react-components';
import { CheckmarkRegular, CheckmarkCircleRegular, ErrorCircleRegular, InfoRegular } from '@fluentui/react-icons';
import { useEffect, useId, useMemo, useState } from 'react';
import { composePrompt, initialOptionValues, initialVariableValues, promptUsesModelPlaceholder, promptUsesRubberDuckModelPlaceholder, type OptionValues, type VariableValues } from '../data/composer';
import type { ModelPreset, Prompt, PromptVariable, ValidationIssue } from '../data/schemas';
import { formatCount, shouldUseTextarea } from './promptUi';

const useStyles = makeStyles({
  panel: {
    display: 'grid',
    gap: '22px',
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
    gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)',
    gap: '40px',
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
  previewFrame: {
    display: 'grid',
    gap: '10px',
    '@media (min-width: 1101px)': {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column'
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
    }
  },
  rail: {
    display: 'grid',
    gap: '24px',
    alignContent: 'start',
    minWidth: 0,
    '@media (min-width: 1101px)': {
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: '4px',
      paddingBottom: '8px'
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
    gap: '4px'
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  check: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    userSelect: 'none',
    padding: '6px 0',
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
    fontFamily: 'var(--sw-sans)',
    fontSize: '14px',
    lineHeight: 1.3,
    color: 'var(--sw-ink)'
  },
  fields: {
    display: 'grid',
    gap: '20px'
  },
  field: {
    display: 'grid',
    gap: '8px'
  },
  fieldLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px'
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
    backgroundColor: 'transparent',
    '& input': {
      fontFamily: 'var(--sw-sans)',
      fontSize: '14px',
      color: 'var(--sw-ink)'
    },
    '& select': {
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
  // info tooltip
  infoWrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center'
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
  infoBubble: {
    position: 'absolute',
    zIndex: 30,
    bottom: 'calc(100% + 6px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: '260px',
    padding: '10px 12px',
    border: 'none',
    backgroundColor: 'var(--sw-ink)',
    color: '#ffffff',
    fontFamily: 'var(--sw-sans)',
    fontSize: '12px',
    lineHeight: 1.45,
    whiteSpace: 'normal'
  }
});

type Props = {
  prompt?: Prompt;
  presets: ModelPreset[];
  issues: ValidationIssue[];
};

export function Composer({ prompt, presets, issues }: Props) {
  const styles = useStyles();
  const [modelId, setModelId] = useState<string>('');
  const [rubberDuckModelId, setRubberDuckModelId] = useState<string>('');
  const [values, setValues] = useState<VariableValues>({});
  const [optionValues, setOptionValues] = useState<OptionValues>({});
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | undefined>();

  useEffect(() => {
    if (!prompt) {
      setValues({});
      setOptionValues({});
      setModelId('');
      setRubberDuckModelId('');
      return;
    }
    const defaultModelId = prompt.defaultModelId && presets.some((preset) => preset.id === prompt.defaultModelId) ? prompt.defaultModelId : presets[0]?.id ?? '';
    setValues(initialVariableValues(prompt.variables));
    setOptionValues(initialOptionValues(prompt.options));
    setModelId(promptUsesModelPlaceholder(prompt) ? defaultModelId : '');
    setRubberDuckModelId(promptUsesRubberDuckModelPlaceholder(prompt) ? defaultModelId : '');
    setFeedback(undefined);
  }, [prompt?.key, presets]);

  const selectedPreset = useMemo(() => presets.find((preset) => preset.id === modelId), [modelId, presets]);
  const selectedRubberDuckPreset = useMemo(() => presets.find((preset) => preset.id === rubberDuckModelId), [rubberDuckModelId, presets]);
  const composition = useMemo(
    () => prompt ? composePrompt(prompt, values, { model: selectedPreset?.label, rubberDuckModel: selectedRubberDuckPreset?.label }, { validationIssues: issues, optionValues }) : undefined,
    [issues, optionValues, prompt, selectedPreset?.label, selectedRubberDuckPreset?.label, values]
  );
  const visibleVariables = useMemo(() => {
    if (!prompt) return [];
    if (!composition) return prompt.variables;
    const activeVariableNames = new Set(composition.activeVariableNames);
    return prompt.variables.filter((variable) => activeVariableNames.has(variable.name));
  }, [composition, prompt]);

  if (!prompt) {
    return <Text className={styles.emptyInputs}>Select a prompt to compose it.</Text>;
  }

  const copyDisabled = !composition?.canCopy;
  const previewText = composition?.text ?? '';
  const charCount = previewText.length;
  const isCommand = prompt.kind === 'command';
  const copyLabel = isCommand ? 'Copy command' : 'Copy composed prompt';
  const previewLabel = isCommand ? 'Composed command' : 'Composed prompt';
  const rawTemplateLabel = isCommand ? 'Raw command template' : 'Raw template';

  const metaItems = [prompt.category];
  if (isCommand) metaItems.push('command');
  metaItems.push(visibleVariables.length > 0 ? formatCount(visibleVariables.length, 'input') : 'no inputs');

  async function copyComposedPrompt() {
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
  }

  const usesModel = composition?.usesModelPlaceholder;
  const usesRubberDuck = composition?.usesRubberDuckModelPlaceholder;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{prompt.title}</h2>
          {prompt.description ? <InfoTooltip text={prompt.description} styles={styles} /> : null}
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
            ) : null}
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
          {prompt.options.length > 0 ? (
            <section className={styles.section}>
              <span className={styles.eyebrow}>Focus areas</span>
              <div className={styles.optionList}>
                {prompt.options.map((option) => {
                  const checked = Boolean(optionValues[option.id]);
                  return (
                    <div key={option.id} className={styles.checkRow}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          className={styles.checkInput}
                          checked={checked}
                          onChange={(event) => setOptionValues((current) => ({ ...current, [option.id]: event.target.checked }))}
                        />
                        <span className={styles.checkBox} data-box aria-hidden="true"><CheckmarkRegular /></span>
                        <span className={styles.checkText}>{option.label}</span>
                      </label>
                      {option.description ? <InfoTooltip text={option.description} styles={styles} /> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {usesModel || usesRubberDuck ? (
            <section className={styles.section}>
              <span className={styles.eyebrow}>Model</span>
              <div className={styles.fields}>
                {usesModel ? (
                  <div className={styles.field}>
                    <span className={styles.labelText}>General model</span>
                    <Select
                      appearance="underline"
                      className={styles.underlineField}
                      aria-label="General model"
                      value={modelId}
                      disabled={presets.length === 0}
                      onChange={(_, data) => setModelId(data.value)}
                    >
                      {modelId ? null : <option value="">Select a model preset</option>}
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {usesRubberDuck ? (
                  <div className={styles.field}>
                    <span className={styles.labelText}>Alternative model</span>
                    <Select
                      appearance="underline"
                      className={styles.underlineField}
                      aria-label="Alternative model"
                      value={rubberDuckModelId}
                      disabled={presets.length === 0}
                      onChange={(_, data) => setRubberDuckModelId(data.value)}
                    >
                      {rubberDuckModelId ? null : <option value="">Select an alternative model preset</option>}
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className={styles.section}>
            <span className={styles.eyebrow}>Inputs</span>
            {visibleVariables.length > 0 ? (
              <div className={styles.fields}>
                {visibleVariables.map((variable) => (
                  <Field
                    key={variable.name}
                    variable={variable}
                    value={values[variable.name] ?? ''}
                    invalid={Boolean(composition?.missingRequired.includes(variable.name))}
                    styles={styles}
                    onChange={(next) => setValues((current) => ({ ...current, [variable.name]: next }))}
                  />
                ))}
              </div>
            ) : (
              <Text className={styles.emptyInputs}>No inputs are needed for the current focus selection.</Text>
            )}
          </section>

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

function Field({ variable, value, invalid, styles, onChange }: { variable: PromptVariable; value: string; invalid: boolean; styles: ComposerStyles; onChange: (value: string) => void }) {
  const errorId = useId();
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        <span className={styles.labelText}>{variable.label}</span>
        {variable.required ? <span className={styles.req} aria-hidden="true">*</span> : null}
        {variable.description ? <InfoTooltip text={variable.description} styles={styles} /> : null}
      </span>
      {shouldUseTextarea(variable) ? (
        <Textarea
          className={styles.textareaField}
          resize="vertical"
          value={value}
          aria-label={variable.label}
          aria-required={variable.required}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
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
          onChange={(_, data) => onChange(data.value)}
        />
      )}
      {invalid ? <span id={errorId} role="alert" className={styles.fieldError}>{variable.label} is required</span> : null}
    </div>
  );
}

function InfoTooltip({ text, styles }: { text: string; styles: ComposerStyles }) {
  const [open, setOpen] = useState(false);
  const bubbleId = useId();

  return (
    <span
      className={styles.infoWrap}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
    >
      <button type="button" className={styles.infoTrigger} aria-label={text} aria-describedby={open ? bubbleId : undefined}><InfoRegular /></button>
      {open ? <span id={bubbleId} className={styles.infoBubble} role="tooltip">{text}</span> : null}
    </span>
  );
}
