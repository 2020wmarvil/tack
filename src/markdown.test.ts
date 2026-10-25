import { describe, expect, it } from 'vitest';
import { describedText, docToMarkdown, escapeLineStarts, loadDescription, markdownToDoc } from './markdown';

const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md));

describe('description Markdown', () => {
  it.each([
    ['heading', '##### Open questions'],
    ['small heading', '###### Detail'],
    ['inline marks', 'Some **bold**, *italic*, ~~strike~~ and `code`.'],
    ['bullets', '- one\n- two\n  - nested'],
    ['numbered list', '1. first\n2. second'],
    ['numbered list from three', '3. third\n4. fourth'],
    ['quote', '> quoted\n> lines'],
    ['code block', '```ts\nconst a = 1;\n\n## not a heading\n```'],
    ['link', 'See [the reference](https://example.com/materials).'],
    ['divider', 'Above\n\n---\n\nBelow'],
    ['paragraphs', 'Para one\n\nPara two'],
    ['soft line break', 'Line one\nline two'],
    ['hard line break', 'a  \nhard break'],
    ['bold italic', '***both***'],
    ['the example card', 'Edit a material.\n\n##### Open questions\n\nUse the [material reference](https://example.com/materials) for the layout.'],
    ['escaped line starts', '\\# not a heading\n\n\\- not a bullet\n\n1\\. not a list\n\n\\*\\*\\*'],
    ['escaped marks', '\\*\\*not bold\\*\\*'],
    ['empty', ''],
  ])('keeps %s unchanged', (_, md) => {
    expect(roundTrip(md)).toBe(md);
  });

  it('settles other spellings on one stable form', () => {
    for (const [input, expected] of [
      ['__bold__ and _it_', '**bold** and *it*'],
      ['* star', '- star'],
      ['- a\n\n- loose b', '- a\n- loose b'],
    ]) {
      expect(roundTrip(input)).toBe(expected);
      expect(roundTrip(expected)).toBe(expected);
    }
  });

  it('escapes typed text that would otherwise become structure', () => {
    const doc = { type: 'doc', content: ['# idea', '- dash', '12. dozen', '> said', '```', '***', 'fine # here'].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) };
    const md = docToMarkdown(doc);
    expect(md).toBe('\\# idea\n\n\\- dash\n\n12\\. dozen\n\n&gt; said\n\n\\`\\`\\`\n\n\\*\\*\\*\n\nfine # here');
    expect(markdownToDoc(md)).toEqual(doc);
  });

  it('drops empty paragraphs at either end', () => {
    const para = (text?: string) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });
    expect(docToMarkdown({ type: 'doc', content: [para(), para('kept'), para(), para()] })).toBe('kept');
    expect(docToMarkdown({ type: 'doc', content: [para(), para()] })).toBe('');
  });

  it('leaves ordinary line starts alone', () => {
    expect(escapeLineStarts('#hashtag\n-not a bullet\n2024 was good\n**bold**')).toBe('#hashtag\n-not a bullet\n2024 was good\n**bold**');
  });
});

describe('loadDescription', () => {
  it('keeps the exact text of an untouched description', () => {
    const { doc, source } = loadDescription('__bold__\n\n* star');
    expect(describedText(source, doc)).toBe('__bold__\n\n* star');
  });

  it('writes the editor form once the content changes', () => {
    const { doc, source } = loadDescription('__bold__');
    const edited = { ...doc, content: [...doc.content!, { type: 'paragraph', content: [{ type: 'text', text: 'more' }] }] };
    expect(describedText(source, edited)).toBe('**bold**\n\nmore');
  });
});
