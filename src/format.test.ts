import { describe, expect, it } from 'vitest';
import { COLUMNS, FormatError, parseProject, serializeProject, type Project } from './format';

const sample = `# Atlas Engine

## Rendering

### Backlog

#### Explore a deferred lighting pass

#### Shadows flicker at shallow angles

### Ready

#### Add a wireframe view

- [x] Draw triangle edges
- [ ] Add viewport toggle
- [ ] Check dense meshes

### In Progress

#### Build the material inspector

Edit a material without leaving the scene. Keep the first pass focused on **base color**, roughness and metallic.

##### Open questions

Use the [material reference](https://example.com/materials) for the field layout.

- [x] Lay out the material fields
- [ ] Preview changes in the viewport
- [ ] Handle missing textures

### In Review

### Finished

#### Clear the viewport on resize

## Physics

### Backlog

#### Add capsule colliders

### Ready

### In Progress

### In Review

### Finished
`;

/** The project without in-memory IDs, for comparisons. */
function shape(project: Project) {
  return {
    name: project.name,
    boards: project.boards.map((b) => ({
      name: b.name,
      columns: b.columns.map((cards) => cards.map(({ title, description, checklist }) => ({ title, description, checklist }))),
    })),
  };
}

function errorOf(text: string) {
  try {
    parseProject(text);
  } catch (e) {
    if (e instanceof FormatError) return { message: e.message, line: e.line };
    throw e;
  }
  throw new Error('expected a FormatError');
}

describe('parseProject', () => {
  it('reads the example project', () => {
    const p = parseProject(sample);
    expect(p.name).toBe('Atlas Engine');
    expect(p.boards.map((b) => b.name)).toEqual(['Rendering', 'Physics']);
    const [backlog, ready, inProgress, inReview, finished] = p.boards[0].columns;
    expect(backlog.map((c) => c.title)).toEqual(['Explore a deferred lighting pass', 'Shadows flicker at shallow angles']);
    expect(backlog[0]).toMatchObject({ description: '', checklist: [] });
    expect(ready[0].checklist).toEqual([
      { text: 'Draw triangle edges', done: true },
      { text: 'Add viewport toggle', done: false },
      { text: 'Check dense meshes', done: false },
    ]);
    expect(inProgress[0].description).toBe(
      'Edit a material without leaving the scene. Keep the first pass focused on **base color**, roughness and metallic.\n\n' +
        '##### Open questions\n\n' +
        'Use the [material reference](https://example.com/materials) for the field layout.',
    );
    expect(inProgress[0].checklist).toHaveLength(3);
    expect(inReview).toEqual([]);
    expect(finished.map((c) => c.title)).toEqual(['Clear the viewport on resize']);
  });

  it('writes the example back unchanged', () => {
    expect(serializeProject(parseProject(sample))).toBe(sample);
  });

  it('gives every card and board a distinct id', () => {
    const p = parseProject(sample);
    const ids = [...p.boards.map((b) => b.id), ...p.boards.flatMap((b) => b.columns.flat().map((c) => c.id))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts CRLF line endings and a byte order mark', () => {
    const p = parseProject('\uFEFF' + sample.replace(/\n/g, '\r\n'));
    expect(shape(p)).toEqual(shape(parseProject(sample)));
  });

  it('treats missing columns as empty and accepts any column order', () => {
    const p = parseProject('# P\n\n## B\n\n### finished\n\n#### Done\n\n### backlog\n\n#### Todo\n');
    expect(p.boards[0].columns.map((c) => c.map((x) => x.title))).toEqual([['Todo'], [], [], [], ['Done']]);
  });

  it('writes all five columns in canonical order', () => {
    const out = serializeProject(parseProject('# P\n\n## B\n\n### Finished\n'));
    expect(out.match(/^### .*/gm)).toEqual(COLUMNS.map((c) => `### ${c}`));
  });

  it('accepts a project with no boards and a board named like a column', () => {
    expect(parseProject('# Empty\n').boards).toEqual([]);
    expect(parseProject('# P\n\n## Backlog\n\n### Backlog\n').boards[0].name).toBe('Backlog');
  });

  it('ignores headings inside fenced code blocks', () => {
    const text = '# P\n\n## B\n\n### Backlog\n\n#### Card\n\n```md\n## Not a board\n### Ready\n```\n\n~~~\n# nope\n~~~\n';
    const p = parseProject(text);
    expect(p.boards).toHaveLength(1);
    expect(p.boards[0].columns[0][0].description).toBe('```md\n## Not a board\n### Ready\n```\n\n~~~\n# nope\n~~~');
    expect(serializeProject(p)).toContain('## Not a board');
  });

  it('only takes the final run of task items as the checklist', () => {
    const text = '# P\n\n## B\n\n### Backlog\n\n#### Card\n\n- [ ] in the description\n\nMore text\n\n- [ ] one\n* [X] two\n- [ ]\n';
    const c = parseProject(text).boards[0].columns[0][0];
    expect(c.description).toBe('- [ ] in the description\n\nMore text');
    expect(c.checklist).toEqual([
      { text: 'one', done: false },
      { text: 'two', done: true },
      { text: '', done: false },
    ]);
  });

  it('strips closing hashes and unescapes a trailing hash in titles', () => {
    const p = parseProject('# Project ##\n\n## Board #\n\n### Backlog ###\n\n#### Issue \\#\n\n#### Learn C#\n');
    expect(p.name).toBe('Project');
    expect(p.boards[0].name).toBe('Board');
    expect(p.boards[0].columns[0].map((c) => c.title)).toEqual(['Issue #', 'Learn C#']);
  });

  it('does not treat indented or hashtag lines as headings', () => {
    const c = parseProject('# P\n\n## B\n\n### Backlog\n\n#### Card\n\n    ## indented code\n#hashtag\n').boards[0].columns[0][0];
    expect(c.description).toBe('    ## indented code\n#hashtag');
  });

  it('reports malformed files with a line number', () => {
    expect(errorOf('')).toMatchObject({ line: 1 });
    expect(errorOf('Some notes\n# P\n')).toMatchObject({ line: 1 });
    expect(errorOf('# P\n\nStray notes\n')).toMatchObject({ line: 3 });
    expect(errorOf('# P\n\n## B\n\nStray notes\n')).toMatchObject({ line: 5 });
    expect(errorOf('# P\n# Q\n')).toMatchObject({ line: 2 });
    expect(errorOf('# P\n\n### Backlog\n')).toMatchObject({ line: 3 });
    expect(errorOf('# P\n\n## B\n\n#### Card\n')).toMatchObject({ line: 5 });
    expect(errorOf('# P\n\n## B\n\n### Doing\n')).toMatchObject({ line: 5, message: expect.stringContaining('Doing') });
    expect(errorOf('# P\n\n## B\n\n### Ready\n\n### ready\n')).toMatchObject({ line: 7 });
    expect(errorOf('# P\n\n## B\n\n### Ready\n\n#### Card\n\n```\n## code\n')).toMatchObject({ line: 9 });
    expect(errorOf('# P\n\n## \n')).toMatchObject({ line: 3 });
  });
});

describe('serializeProject', () => {
  const project = (description: string, checklist: { text: string; done: boolean }[] = []): Project => ({
    name: 'P',
    boards: [{ id: 'b', name: 'B', columns: [[{ id: 'c', title: 'Card', description, checklist }], [], [], [], []] }],
  });
  const cardAfterRoundTrip = (p: Project) => parseProject(serializeProject(p)).boards[0].columns[0][0];

  it('demotes shallow description headings so they stay inside the card', () => {
    const c = cardAfterRoundTrip(project('# Big\n## Medium\n#### Small\n##### Kept\n```\n# code\n```'));
    expect(c.description).toBe('##### Big\n##### Medium\n##### Small\n##### Kept\n```\n# code\n```');
  });

  it('closes an unclosed code block in a description', () => {
    const p = project('```\ncode\n## still code');
    expect(cardAfterRoundTrip(p).description).toBe('```\ncode\n## still code\n```');
  });

  it('keeps a description that ends in a task item out of the checklist', () => {
    expect(cardAfterRoundTrip(project('Steps\n\n- [ ] not a checklist'))).toMatchObject({
      description: 'Steps\n\n- \\[ ] not a checklist',
      checklist: [],
    });
    expect(cardAfterRoundTrip(project('- [x] desc', [{ text: 'real', done: false }]))).toMatchObject({
      description: '- \\[x] desc',
      checklist: [{ text: 'real', done: false }],
    });
  });

  it('keeps names and titles on one line and escapes trailing hashes', () => {
    const p = project('');
    p.name = 'Two\nlines';
    p.boards[0].columns[0][0].title = 'Ends with #';
    p.boards[0].columns[0][0].checklist = [{ text: 'item\nsplit', done: true }];
    const out = serializeProject(p);
    expect(out).toContain('# Two lines\n');
    expect(out).toContain('#### Ends with \\#\n');
    expect(out).toContain('- [x] item split\n');
    expect(cardAfterRoundTrip(p).title).toBe('Ends with #');
  });

  it('round-trips everything it writes', () => {
    const p = project('Line one\n\n\n> quote\n\n1. a\n2. b\n\n---\n\n~~strike~~ *em* `code`', [{ text: 'x', done: true }]);
    const once = serializeProject(p);
    expect(serializeProject(parseProject(once))).toBe(once);
    expect(shape(parseProject(once))).toEqual(shape(p));
  });
});
