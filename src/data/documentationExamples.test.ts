import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePromptFile } from './schemas';

const documents = ['../../schema.md', '../../docs/authoring.md', '../../README.md'];

describe('prompt documentation examples', () => {
  it.each(documents)('parses every complete prompt example in %s', (relativePath) => {
    const filePath = fileURLToPath(new URL(relativePath, import.meta.url));
    const source = readFileSync(filePath, 'utf8');
    const examples = [...source.matchAll(/```markdown\s*\n(---\s*\n[\s\S]*?)```/g)].map((match) => match[1].trim());

    expect(examples.length).toBeGreaterThan(0);
    examples.forEach((example, index) => {
      expect(parsePromptFile(`${relativePath}#example-${index + 1}.md`, example).issues).toEqual([]);
    });
  });
});
