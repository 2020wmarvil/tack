import { MarkdownManager } from '@tiptap/markdown';
import Paragraph from '@tiptap/extension-paragraph';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';

/** Visual editor headings are stored at this level, below the file's structure. */
export const HEADING_LEVEL = 5;

/**
 * TipTap drops backslash escapes when it writes paragraphs back out, so text
 * that merely starts like a heading, list, quote or code fence would turn into
 * one on the next load. Put the escapes back at the start of each line.
 */
export function escapeLineStarts(text: string) {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*)([-+*])(?=\s)/, '$1\\$2')
        .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
        .replace(/^(\s*)>/, '$1\\>')
        .replace(/^(\s*)(`{3,}|~{3,})/, '$1\\$2')
        .replace(/^(\s*)([-*_])((?:\s*\2){2,}\s*)$/, '$1\\$2$3'),
    )
    .join('\n');
}

const SafeParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    const parent = this.parent as unknown as (n: typeof node, h: typeof helpers, c: typeof context) => string;
    return escapeLineStarts(parent(node, helpers, context));
  },
});

/** The editing features of a card description, shared by the editor and the converter. */
export const descriptionExtensions = [
  StarterKit.configure({
    paragraph: false,
    underline: false,
    link: { openOnClick: false, autolink: false, protocols: ['http', 'https'] },
  }),
  SafeParagraph,
];

const manager = new MarkdownManager({ extensions: descriptionExtensions });

export const markdownToDoc = (markdown: string): JSONContent => manager.parse(markdown);
const isEmptyParagraph = (node: JSONContent) => node.type === 'paragraph' && !node.content?.length;

/** Empty paragraphs at either end are editing leftovers, not content. */
export function docToMarkdown(doc: JSONContent) {
  const content = [...(doc.content ?? [])];
  while (content.length && isEmptyParagraph(content[0])) content.shift();
  while (content.length && isEmptyParagraph(content[content.length - 1])) content.pop();
  return manager.serialize({ ...doc, content }).replace(/\s+$/, '');
}

/** A description as it was loaded: its exact text, and how the editor would write it back. */
export interface DescriptionSource {
  text: string;
  normalized: string;
}

export function loadDescription(text: string) {
  const doc = markdownToDoc(text);
  return { doc, source: { text, normalized: docToMarkdown(doc) } };
}

/** The description to store. Until the content actually changes, it is the loaded text exactly. */
export function describedText(source: DescriptionSource, doc: JSONContent) {
  const out = docToMarkdown(doc);
  return out === source.normalized ? source.text : out;
}
