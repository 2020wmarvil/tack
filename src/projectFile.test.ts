import { describe, expect, it } from 'vitest';
import { newId, type Project } from './format';
import { ProjectFile, type FileSystem } from './projectFile';

const PATH = '/projects/atlas.md';
const initial = '# Atlas\n\n## Rendering\n\n### Backlog\n\n#### First card\n';

/** An in-memory disk. `edit` plays the part of another program. */
interface FakeDisk {
  text: string | null;
  writes: number;
  failWrites: boolean;
  edit(next: string | null): void;
  fs: FileSystem;
}

function fakeDisk(text: string | null = initial) {
  let version = 0;
  const disk: FakeDisk = {
    text,
    writes: 0,
    failWrites: false,
    edit(next: string | null) {
      disk.text = next;
      version++;
    },
    fs: {
      async read() {
        if (disk.text === null) throw new Error('not found');
        return disk.text;
      },
      async write(_: string, next: string) {
        if (disk.failWrites) throw new Error('disk full');
        disk.writes++;
        disk.edit(next);
      },
      async stamp() {
        return disk.text === null ? '' : `${disk.text.length}:${version}`;
      },
    },
  };
  return disk;
}

async function openFile(disk: ReturnType<typeof fakeDisk>) {
  const log = { changes: 0, external: [] as (Project | null)[], messages: [] as string[] };
  const file = await ProjectFile.open(PATH, disk.fs, {
    onChange: () => log.changes++,
    onExternal: (previous) => log.external.push(previous),
    onMessage: (m) => log.messages.push(m),
  });
  return { file, log };
}

const addCard = (title: string) => (p: Project): Project => {
  const next = structuredClone(p);
  next.boards[0].columns[0].push({ id: newId(), title, description: '', checklist: [] });
  return next;
};
const titles = (file: ProjectFile) => file.project!.boards[0].columns[0].map((c) => c.title);

describe('ProjectFile', () => {
  it('opens and parses the file', async () => {
    const { file } = await openFile(fakeDisk());
    expect(file.error).toBeNull();
    expect(titles(file)).toEqual(['First card']);
  });

  it('rejects a file that cannot be read', async () => {
    await expect(openFile(fakeDisk(null))).rejects.toThrow('not found');
  });

  it('opens a malformed file with an error and refuses changes', async () => {
    const { file, log } = await openFile(fakeDisk('notes\n'));
    expect(file.project).toBeNull();
    expect(file.error).toMatch(/^Line 1:/);
    expect(file.change('Create card', addCard('x'))).toBe(false);
    expect(log.messages).toHaveLength(1);
  });

  it('applies a change at once and writes it', async () => {
    const disk = fakeDisk();
    const { file, log } = await openFile(disk);
    file.change('Create card', addCard('Second card'));
    expect(titles(file)).toEqual(['First card', 'Second card']);
    await file.check();
    expect(disk.text).toContain('#### Second card');
    expect(log.external).toEqual([]);
    expect(log.messages).toEqual([]);
  });

  it('writes several quick changes in order', async () => {
    const disk = fakeDisk();
    const { file } = await openFile(disk);
    file.change('Create card', addCard('A'));
    file.change('Create card', addCard('B'));
    file.change('Create card', addCard('C'));
    await file.check();
    expect(disk.writes).toBe(3);
    expect(disk.text).toContain('#### A\n\n#### B\n\n#### C\n\n### Ready');
  });

  it('does not mistake its own writes for outside edits', async () => {
    const { file, log } = await openFile(fakeDisk());
    file.change('Create card', addCard('Mine'));
    await file.check();
    await file.check();
    expect(log.external).toEqual([]);
  });

  it('reloads outside edits and reports the previous state for undo', async () => {
    const disk = fakeDisk();
    const { file, log } = await openFile(disk);
    const before = file.project;
    disk.edit(initial + '\n#### From elsewhere\n');
    await file.check();
    expect(titles(file)).toEqual(['First card', 'From elsewhere']);
    expect(log.external).toEqual([before]);
  });

  it('ignores a touch that leaves the contents the same', async () => {
    const disk = fakeDisk();
    const { file, log } = await openFile(disk);
    const before = file.project;
    disk.edit(initial);
    await file.check();
    expect(file.project).toBe(before);
    expect(log.external).toEqual([]);
  });

  it('drops a change when the file changed outside Tack first', async () => {
    const disk = fakeDisk();
    const { file, log } = await openFile(disk);
    disk.edit(initial + '\n#### From elsewhere\n');
    file.change('Create card', addCard('Mine'));
    file.change('Create card', addCard('Also mine'));
    await file.check();
    expect(disk.text).toBe(initial + '\n#### From elsewhere\n');
    expect(titles(file)).toEqual(['First card', 'From elsewhere']);
    expect(log.messages).toEqual(['The file changed outside Tack, so your last change was not saved.']);
  });

  it('keeps the last good state while the file is broken, then recovers', async () => {
    const disk = fakeDisk();
    const { file, log } = await openFile(disk);
    disk.edit('# Atlas\n\n## Rendering\n\n### Someday\n');
    await file.check();
    expect(file.error).toMatch(/^Line 5: "Someday" isn't a column/);
    expect(titles(file)).toEqual(['First card']);
    expect(file.change('Create card', addCard('x'))).toBe(false);
    expect(log.external).toEqual([]);
    disk.edit(initial + '\n#### Fixed\n');
    await file.check();
    expect(file.error).toBeNull();
    expect(titles(file)).toEqual(['First card', 'Fixed']);
  });

  it('pauses while the file is missing and resumes when it returns', async () => {
    const disk = fakeDisk();
    const { file } = await openFile(disk);
    disk.edit(null);
    await file.check();
    expect(file.error).toBe('The project file was moved or deleted.');
    expect(file.change('Create card', addCard('x'))).toBe(false);
    disk.edit(initial);
    await file.check();
    expect(file.error).toBeNull();
    expect(file.change('Create card', addCard('Back'))).toBe(true);
    await file.check();
    expect(disk.text).toContain('#### Back');
  });

  it('reverts to the saved state when a write fails', async () => {
    const disk = fakeDisk();
    const { file, log } = await openFile(disk);
    disk.failWrites = true;
    file.change('Create card', addCard('Lost'));
    file.change('Create card', addCard('Also lost'));
    await file.check();
    expect(titles(file)).toEqual(['First card']);
    expect(disk.text).toBe(initial);
    expect(log.messages).toEqual(["Couldn't save the project: disk full"]);
    disk.failWrites = false;
    file.change('Create card', addCard('Saved'));
    await file.check();
    expect(disk.text).toContain('#### Saved');
  });

  describe('undo and redo', () => {
    it('steps back and forward through changes, saving each step', async () => {
      const disk = fakeDisk();
      const { file } = await openFile(disk);
      file.change('Create card', addCard('A'));
      file.change('Create card', addCard('B'));
      expect(file.undo()).toBe('Create card');
      expect(titles(file)).toEqual(['First card', 'A']);
      expect(file.undo()).toBe('Create card');
      expect(file.undo()).toBeNull();
      await file.check();
      expect(disk.text).not.toContain('#### A');
      expect(file.redo()).toBe('Create card');
      expect(file.redo()).toBe('Create card');
      expect(file.redo()).toBeNull();
      await file.check();
      expect(disk.text).toContain('#### A\n\n#### B');
      expect(titles(file)).toEqual(['First card', 'A', 'B']);
    });

    it('clears redo when a new change is made', async () => {
      const { file } = await openFile(fakeDisk());
      file.change('Create card', addCard('A'));
      file.undo();
      expect(file.canRedo).toBe(true);
      file.change('Create card', addCard('B'));
      expect(file.canRedo).toBe(false);
      expect(file.redo()).toBeNull();
    });

    it('records an outside edit as a step that can be undone and redone', async () => {
      const disk = fakeDisk();
      const { file } = await openFile(disk);
      file.change('Create card', addCard('Mine'));
      await file.check();
      disk.edit(disk.text!.replace('#### Mine\n', '#### Mine\n\n#### Theirs\n'));
      await file.check();
      expect(titles(file)).toEqual(['First card', 'Mine', 'Theirs']);
      expect(file.undo()).toBe('External change');
      expect(titles(file)).toEqual(['First card', 'Mine']);
      expect(file.undo()).toBe('Create card');
      expect(titles(file)).toEqual(['First card']);
      expect(file.redo()).toBe('Create card');
      expect(file.redo()).toBe('External change');
      await file.check();
      expect(titles(file)).toEqual(['First card', 'Mine', 'Theirs']);
      expect(disk.text).toContain('#### Theirs');
    });

    it('forgets a change that was never saved', async () => {
      const disk = fakeDisk();
      const { file } = await openFile(disk);
      disk.edit(initial + '\n#### Theirs\n');
      file.change('Create card', addCard('Dropped'));
      await file.check();
      // Only the outside edit is left to undo.
      expect(file.undo()).toBe('External change');
      expect(file.undo()).toBeNull();
      disk.failWrites = true;
      file.change('Create card', addCard('Also dropped'));
      await file.check();
      expect(file.canUndo).toBe(false);
    });

    it('does not undo while changes are paused', async () => {
      const disk = fakeDisk();
      const { file, log } = await openFile(disk);
      file.change('Create card', addCard('A'));
      await file.check();
      disk.edit('broken\n');
      await file.check();
      expect(file.undo()).toBeNull();
      expect(log.messages.at(-1)).toMatch(/^Line 1:/);
      expect(file.canUndo).toBe(true);
    });
  });
});
