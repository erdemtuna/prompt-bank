import { Badge, Card, Divider, Text, Title3, makeStyles, tokens } from '@fluentui/react-components';
import type { ApplicabilityPredicate, ModelPreset, Prompt } from '../data/schemas';

const useStyles = makeStyles({
  panel: {
    display: 'grid',
    gap: tokens.spacingVerticalM
  },
  badges: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap'
  },
  template: {
    whiteSpace: 'pre-wrap',
    overflow: 'auto',
    maxHeight: '240px',
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    fontFamily: tokens.fontFamilyMonospace
  },
  metadata: {
    display: 'grid',
    gap: tokens.spacingVerticalXXS,
    marginTop: tokens.spacingVerticalXXS
  }
});

type Props = {
  prompt?: Prompt;
  presets: ModelPreset[];
};

export function PromptDetail({ prompt, presets }: Props) {
  const styles = useStyles();

  if (!prompt) {
    return <Card><Text>Select a prompt to view details.</Text></Card>;
  }

  const defaultModel = prompt.defaultModelId ? presets.find((preset) => preset.id === prompt.defaultModelId) : undefined;
  const defaultModelText = defaultModel
    ? `Default model: ${defaultModel.label}${defaultModel.id !== defaultModel.label ? ` (${defaultModel.id})` : ''}`
    : prompt.defaultModelId ? `Default model: ${prompt.defaultModelId}` : undefined;
  const modelRoles = (['model', 'rubberDuckModel'] as const)
    .flatMap((name) => prompt.modelRoles?.[name] ? [[name, prompt.modelRoles[name]] as const] : []);

  return (
    <Card className={styles.panel}>
      <div>
        <Title3>{prompt.title}</Title3>
        {prompt.description ? <Text block>{prompt.description}</Text> : null}
      </div>
      <div className={styles.badges}>
        <Badge appearance="filled">{prompt.category}</Badge>
        {defaultModelText ? <Badge appearance="outline">{defaultModelText}</Badge> : null}
        {prompt.tags.map((tag) => <Badge key={tag} appearance="outline">{tag}</Badge>)}
      </div>
      <Text size={200}>Source: {prompt.path}</Text>
      {modelRoles.length > 0 ? (
        <div>
          <Text weight="semibold">Model roles</Text>
          <ul>
            {modelRoles.map(([name, role]) => (
              <li key={name}>
                <Text><code>{`{{${name}}}`}</code> — {role.label}</Text>
                <Text size={200}> — {role.description}</Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {prompt.variables.length > 0 ? (
        <div>
          <Text weight="semibold">Variables</Text>
          <ul>
            {prompt.variables.map((variable) => (
              <li key={variable.name}>
                <Text>{variable.label}{variable.required ? ' (required)' : ' (optional)'}</Text>
                {variable.description ? <Text size={200}> — {variable.description}</Text> : null}
                <ApplicabilityDetails
                  className={styles.metadata}
                  prompt={prompt}
                  visibleWhen={variable.visibleWhen}
                  enabledWhen={variable.enabledWhen}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : <Text>No variables declared.</Text>}
      {prompt.options.length > 0 ? (
        <div>
          <Text weight="semibold">Options</Text>
          <ul>
            {prompt.options.map((option) => (
              <li key={option.id}>
                <Text>{option.label} ({option.defaultEnabled ? 'enabled' : 'disabled'} by default)</Text>
                {option.description ? <Text size={200}> — {option.description}</Text> : null}
                <ApplicabilityDetails
                  className={styles.metadata}
                  prompt={prompt}
                  visibleWhen={option.visibleWhen}
                  enabledWhen={option.enabledWhen}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Divider />
      <Text weight="semibold">Template</Text>
      <pre className={styles.template}>{prompt.template}</pre>
    </Card>
  );
}

type ApplicabilityDetailsProps = {
  className: string;
  prompt: Prompt;
  visibleWhen?: ApplicabilityPredicate;
  enabledWhen?: ApplicabilityPredicate;
};

function ApplicabilityDetails({ className, prompt, visibleWhen, enabledWhen }: ApplicabilityDetailsProps) {
  if (!visibleWhen && !enabledWhen) return null;

  return (
    <div className={className}>
      {visibleWhen ? (
        <Text size={200}><code>visible_when</code>: {formatPredicate(visibleWhen, prompt)}</Text>
      ) : null}
      {enabledWhen ? (
        <Text size={200}><code>enabled_when</code>: {formatPredicate(enabledWhen, prompt)}</Text>
      ) : null}
    </div>
  );
}

function formatPredicate(predicate: ApplicabilityPredicate, prompt: Prompt): string {
  return Object.entries(predicate).map(([variableName, choiceIds]) => {
    const variable = prompt.variables.find((candidate) => candidate.name === variableName);
    const labels = choiceIds.map((choiceId) =>
      variable?.choices?.find((choice) => choice.id === choiceId)?.label ?? choiceId
    );
    return `${variable?.label ?? variableName} ${labels.length === 1 ? 'is' : 'is one of'} ${joinWithOr(labels)}`;
  }).join(' and ');
}

function joinWithOr(values: string[]): string {
  if (values.length < 2) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, or ${values.at(-1)}`;
}
