/*
 * The project file format. Heading levels carry the structure:
 *
 *   # Project name
 *   ## Board
 *   ### Column      (one of the five fixed columns)
 *   #### Card title
 *
 * Under a card, everything is its description except the final run of
 * "- [ ]" / "- [x]" lines, which is its checklist. Description headings use
 * "#####" or "######" so they never collide with the structure. Lines inside
 * fenced code blocks are never structural.
 */

export const COLUMNS = ['Backlog', 'Ready', 'In Progress', 'In Review', 'Finished'] as const;

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  checklist: ChecklistItem[];
}

export interface Board {
  id: string;
  name: string;
  /** One list of cards per entry in COLUMNS, in order. */
  columns: Card[][];
}

export interface Project {
  name: string;
  boards: Board[];
}

export class FormatError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
  }
}

// IDs exist only in memory; the file has none.
let serial = 0;
export const newId = () => `t${++serial}`;

export const emptyColumns = (): Card[][] => COLUMNS.map(() => []);

const HEADING = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const TASK = /^[-*+] \[([ xX])\](?:[ \t]+(.*))?$/;

/** Marks which lines belong to fenced code blocks, including the fence lines. */
function scanFences(lines: string[]) {
  const inCode: boolean[] = [];
  let open: { fence: string; line: number } | null = null;
  lines.forEach((line, i) => {
    if (open) {
      inCode[i] = true;
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === open.fence[0] && close[1].length >= open.fence.length) open = null;
      return;
    }
    const m = FENCE_OPEN.exec(line);
    // A backtick fence's info string may not contain backticks.
    if (m && !(m[1][0] === '`' && m[2].includes('`'))) {
      open = { fence: m[1], line: i };
      inCode[i] = true;
    } else inCode[i] = false;
  });
  return { inCode, unclosed: open as { fence: string; line: number } | null };
}

function headingText(rest: string) {
  return rest
    .trim()
    .replace(/(^|[ \t])#+$/, '')
    .trim()
    .replace(/\\(#+)$/, '$1');
}

function headingLine(text: string) {
  return oneLine(text).replace(/(^|\s)(#+)$/, '$1\\$2');
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function trimBlankLines(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

function splitBody(body: string[]) {
  const lines = trimBlankLines(body);
  let start = lines.length;
  while (start > 0 && TASK.test(lines[start - 1])) start--;
  const checklist = lines.slice(start).map((line) => {
    const m = TASK.exec(line)!;
    return { done: m[1] !== ' ', text: (m[2] ?? '').trim() };
  });
  return { description: trimBlankLines(lines.slice(0, start)).join('\n'), checklist };
}

function columnIndex(name: string) {
  const wanted = oneLine(name).toLowerCase();
  return COLUMNS.findIndex((c) => c.toLowerCase() === wanted);
}

export function parseProject(text: string): Project {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const { inCode, unclosed } = scanFences(lines);
  if (unclosed) throw new FormatError('This code block is never closed.', unclosed.line + 1);

  const needTitle = 'The file must start with a "# Project name" title.';
  let project: Project | null = null;
  let board: Board | null = null;
  let seen = new Set<number>();
  let column: Card[] | null = null;
  let card: { card: Card; body: string[] } | null = null;
  const finishCard = () => {
    if (card) Object.assign(card.card, splitBody(card.body));
    card = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fail = (message: string): never => {
      throw new FormatError(message, i + 1);
    };
    const h = inCode[i] ? null : HEADING.exec(line);
    if (h && h[1].length <= 4) {
      finishCard();
      const level = h[1].length;
      const name = headingText(h[2]);
      if (level === 1) {
        if (project) fail('A project file has only one "#" project title.');
        if (!name) fail('The project title is empty.');
        project = { name, boards: [] };
        continue;
      }
      if (!project) fail(needTitle);
      if (level === 2) {
        if (!name) fail('This board name is empty.');
        board = { id: newId(), name, columns: emptyColumns() };
        project!.boards.push(board);
        seen = new Set();
        column = null;
      } else if (level === 3) {
        if (!board) fail(`The "${name}" column needs to be inside a board ("## Board name").`);
        const index = columnIndex(name);
        if (index < 0) fail(`"${name}" isn't a column. The columns are ${COLUMNS.join(', ')}.`);
        if (seen.has(index)) fail(`The ${COLUMNS[index]} column appears twice in this board.`);
        seen.add(index);
        column = board!.columns[index];
      } else {
        if (!column) fail(`The card "${name}" needs to be inside a column ("### Backlog").`);
        if (!name) fail('This card title is empty.');
        card = { card: { id: newId(), title: name, description: '', checklist: [] }, body: [] };
        column!.push(card.card);
      }
      continue;
    }
    if (card) {
      (card as { body: string[] }).body.push(line);
      continue;
    }
    if (line.trim()) fail(project ? 'Text here needs to be inside a card ("#### Card title").' : needTitle);
  }
  finishCard();
  if (!project) throw new FormatError(needTitle, 1);
  return project;
}

/**
 * Makes a description safe to store under a card: shallow headings are demoted
 * to "#####", an unclosed code block is closed, and a trailing task item is
 * escaped so it is not read back as part of the checklist.
 */
export function safeDescription(description: string) {
  const lines = trimBlankLines(description.replace(/\r\n?/g, '\n').split('\n'));
  const { inCode, unclosed } = scanFences(lines);
  const out = lines.map((line, i) => (inCode[i] ? line : line.replace(/^( {0,3})#{1,4}(?=[ \t]|$)/, '$1#####')));
  if (unclosed) out.push(unclosed.fence);
  else if (out.length && TASK.test(out[out.length - 1])) out[out.length - 1] = out[out.length - 1].replace(/^([-*+]) \[/, '$1 \\[');
  return out.join('\n');
}

export function serializeProject(project: Project) {
  const out = [`# ${headingLine(project.name)}`];
  for (const board of project.boards) {
    out.push('', `## ${headingLine(board.name)}`);
    COLUMNS.forEach((name, i) => {
      out.push('', `### ${name}`);
      for (const card of board.columns[i]) {
        out.push('', `#### ${headingLine(card.title)}`);
        const description = safeDescription(card.description);
        if (description) out.push('', description);
        if (card.checklist.length) {
          out.push('', ...card.checklist.map((item) => `- [${item.done ? 'x' : ' '}] ${oneLine(item.text)}`.trimEnd()));
        }
      }
    });
  }
  return out.join('\n') + '\n';
}
