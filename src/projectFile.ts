import { FormatError, parseProject, serializeProject, type Project } from './format';

export interface FileSystem {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  /** Changes whenever the file changes; empty when the file is missing. */
  stamp(path: string): Promise<string>;
}

export interface Step {
  label: string;
  project: Project;
}

export interface Callbacks {
  /** Something visible changed: the project, or its error. */
  onChange(): void;
  /** The project was replaced by edits made outside Tack. */
  onExternal(previous: Project | null): void;
  onMessage(message: string): void;
}

/**
 * Keeps one project in sync with its Markdown file. Changes apply in memory at
 * once and are written in order. Before each write the file is checked, and
 * edits made outside Tack win over a change that has not been written yet.
 *
 * Undo and redo step through whole-project snapshots. An outside edit is a
 * step too, so undo can step back past it and redo brings it back.
 */
export class ProjectFile {
  /** What the window shows. */
  project: Project | null = null;
  /** The last project known to match the file on disk. */
  private saved: Project | null = null;
  private parseError: string | null = null;
  private missing = false;
  private text: string | null = null;
  /** null means "unknown", so the next check re-reads the file. */
  private stamp: string | null = null;
  /** Bumped whenever the project is replaced from disk, invalidating queued changes. */
  private generation = 0;
  private undoSteps: Step[] = [];
  private redoSteps: Step[] = [];
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  private constructor(
    readonly path: string,
    private fs: FileSystem,
    private callbacks: Callbacks,
  ) {}

  /** Opens a project file. Rejects when it cannot be read; a malformed file opens with an error. */
  static async open(path: string, fs: FileSystem, callbacks: Callbacks) {
    const file = new ProjectFile(path, fs, callbacks);
    const stamp = await fs.stamp(path);
    file.load(await fs.read(path), stamp);
    return file;
  }

  /** Why changes are paused, if they are. */
  get error() {
    return this.missing ? 'The project file was moved or deleted.' : this.parseError;
  }

  /** Looks for edits made outside Tack. Skipped while changes are being written. */
  check() {
    return this.pending ? this.queue : this.enqueue(async () => void (await this.refresh()));
  }

  get canUndo() {
    return this.undoSteps.length > 0;
  }

  get canRedo() {
    return this.redoSteps.length > 0;
  }

  /** Applies a change immediately, saves it and records it for undo. Returns false when changes are paused. */
  change(label: string, update: (project: Project) => Project) {
    if (!this.editable()) return false;
    const step = { label, project: this.project! };
    this.undoSteps.push(step);
    this.redoSteps = [];
    this.apply(update(this.project!), () => remove(this.undoSteps, step));
    return true;
  }

  /** Steps back. Returns the undone step's label, or null when there is nothing to undo. */
  undo() {
    return this.travel(this.undoSteps, this.redoSteps);
  }

  /** Steps forward again. Returns the redone step's label, or null when there is nothing to redo. */
  redo() {
    return this.travel(this.redoSteps, this.undoSteps);
  }

  private travel(from: Step[], to: Step[]) {
    if (!from.length || !this.editable()) return null;
    const step = from.pop()!;
    const back = { label: step.label, project: this.project! };
    to.push(back);
    this.apply(step.project, () => remove(to, back));
    return step.label;
  }

  private editable() {
    if (this.project && !this.error) return true;
    this.callbacks.onMessage(this.error ?? 'No project is open.');
    return false;
  }

  /** Shows a new state at once and writes it. `dropped` runs if it is never saved. */
  private apply(next: Project, dropped: () => void) {
    const generation = this.generation;
    this.project = next;
    this.callbacks.onChange();
    this.enqueue(async () => {
      // The file was reloaded after this change was made, so it no longer applies.
      if (generation !== this.generation) return dropped();
      if (await this.refresh()) {
        dropped();
        this.callbacks.onMessage('The file changed outside Tack, so your last change was not saved.');
        return;
      }
      if (this.error) return dropped();
      const text = serializeProject(next);
      try {
        await this.fs.write(this.path, text);
      } catch (e) {
        dropped();
        this.project = this.saved;
        this.generation++;
        this.callbacks.onChange();
        this.callbacks.onMessage(`Couldn't save the project: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      this.text = text;
      this.saved = next;
      this.stamp = null;
      // Catches anything written by another program right after our write.
      await this.refresh();
    });
    return true;
  }

  private enqueue(task: () => Promise<void>) {
    this.pending++;
    this.queue = this.queue
      .then(task)
      .catch((e) => this.callbacks.onMessage(e instanceof Error ? e.message : String(e)))
      .finally(() => void this.pending--);
    return this.queue;
  }

  /** Reloads the file if it changed. Returns true when the project was replaced. */
  private async refresh() {
    const stamp = await this.fs.stamp(this.path);
    if (stamp === this.stamp) return false;
    if (!stamp) {
      this.stamp = stamp;
      if (!this.missing) {
        this.missing = true;
        this.project = this.saved;
        this.generation++;
        this.callbacks.onChange();
      }
      return false;
    }
    const text = await this.fs.read(this.path);
    const wasMissing = this.missing;
    this.missing = false;
    if (text === this.text) {
      this.stamp = stamp;
      if (wasMissing) this.callbacks.onChange();
      return false;
    }
    const previous = this.saved;
    const parsed = this.load(text, stamp);
    this.generation++;
    if (parsed) {
      if (previous) {
        this.undoSteps.push({ label: 'External change', project: previous });
        this.redoSteps = [];
      }
      this.callbacks.onExternal(previous);
    }
    this.callbacks.onChange();
    return true;
  }

  private load(text: string, stamp: string) {
    this.text = text;
    this.stamp = stamp;
    try {
      this.project = this.saved = parseProject(text);
      this.parseError = null;
      return true;
    } catch (e) {
      if (!(e instanceof FormatError)) throw e;
      // Keep showing the last good state until the file is fixed.
      this.project = this.saved;
      this.parseError = `Line ${e.line}: ${e.message}`;
      return false;
    }
  }
}

function remove(steps: Step[], step: Step) {
  const i = steps.indexOf(step);
  if (i >= 0) steps.splice(i, 1);
}
