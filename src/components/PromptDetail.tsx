import { Badge, Card, Divider, Text, Title3, makeStyles, tokens } from '@fluentui/react-components';
import type { ModelPreset, Prompt } from '../data/schemas';

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
      {prompt.variables.length > 0 ? (
        <div>
          <Text weight="semibold">Variables</Text>
          <ul>
            {prompt.variables.map((variable) => (
              <li key={variable.name}>
                <Text>{variable.label}{variable.required ? ' (required)' : ' (optional)'}</Text>
                {variable.description ? <Text size={200}> — {variable.description}</Text> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : <Text>No variables declared.</Text>}
      <Divider />
      <Text weight="semibold">Template</Text>
      <pre className={styles.template}>{prompt.template}</pre>
    </Card>
  );
}
