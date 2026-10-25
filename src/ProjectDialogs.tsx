import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { documentDir, homeDir, isAbsolute, sep } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { serializeProject } from './format';
import { createFile, errorText } from './files';
import { Icon } from './icons';
import type { Recent } from './recent';

const markdownFilter = [{ name: 'Markdown', extensions: ['md'] }];
const slug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'my-project';

/** Expands "~" and checks that the path is a full path to a Markdown file. */
async function resolvePath(input: string): Promise<{ path: string } | { error: string }> {
  let path = input.trim();
  if (path === '~' || path.startsWith('~/') || path.startsWith('~\\')) path = (await homeDir()) + path.slice(1);
  if (!/\.md$/i.test(path)) return { error: 'Choose a Markdown file ending in .md.' };
  if (!(await isAbsolute(path))) return { error: 'Use a full path, starting from the top of a drive or your home folder (~).' };
  return { path };
}

function showError(input: HTMLInputElement | null, message: string) {
  input?.setCustomValidity(message);
  input?.reportValidity();
}

function Modal({ title, onClose, children }: { title: string; onClose(): void; children(close: () => void): ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  const close = () => ref.current?.close();
  return (
    <dialog ref={ref} className="small-dialog" aria-label={title} onClose={onClose}>
      <header className="editor-head">
        <h2>{title}</h2>
        <button className="icon-button" type="button" aria-label={`Cancel ${title.toLowerCase()}`} onClick={close}>
          <Icon name="x" />
        </button>
      </header>
      {children(close)}
    </dialog>
  );
}

export function NewProjectDialog({ onClose, onCreated }: { onClose(): void; onCreated(path: string): Promise<void> }) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [folder, setFolder] = useState('');
  const [pathEdited, setPathEdited] = useState(false);
  const pathRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    documentDir()
      .then((dir) => setFolder(dir + sep()))
      .catch(() => setFolder('~/'));
  }, []);
  useEffect(() => {
    if (!pathEdited && folder) setPath(folder + slug(name) + '.md');
  }, [name, folder, pathEdited]);

  const editPath = (value: string) => {
    setPath(value);
    setPathEdited(true);
    pathRef.current?.setCustomValidity('');
  };

  const browse = async () => {
    const chosen = await save({ defaultPath: path || undefined, filters: markdownFilter });
    if (chosen) editPath(chosen);
  };

  const submit = async (e: FormEvent, close: () => void) => {
    e.preventDefault();
    const projectName = name.trim();
    if (!projectName) return;
    const resolved = await resolvePath(path);
    if ('error' in resolved) return showError(pathRef.current, resolved.error);
    try {
      await createFile(resolved.path, serializeProject({ name: projectName, boards: [] }));
    } catch (err) {
      return showError(pathRef.current, errorText(err));
    }
    await onCreated(resolved.path);
    close();
  };

  return (
    <Modal title="New project" onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => submit(e, close)}>
          <div className="dialog-form">
            <div className="form-field">
              <label htmlFor="new-project-name">Project name</label>
              <input
                id="new-project-name"
                placeholder="My project"
                required
                autoComplete="off"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="project-path">Project file</label>
              <div className="file-input-row">
                <input
                  id="project-path"
                  ref={pathRef}
                  required
                  autoComplete="off"
                  value={path}
                  onChange={(e) => editPath(e.target.value)}
                />
                <button className="browse-button" type="button" onClick={browse}>
                  Browse...
                </button>
              </div>
              <p className="field-help">All boards live together in this Markdown file.</p>
            </div>
          </div>
          <footer className="dialog-footer">
            <button className="secondary" type="button" onClick={close}>
              Cancel
            </button>
            <button className="primary" type="submit">
              Create project
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}

export function RenameDialog({
  kind,
  value,
  help,
  onClose,
  onRename,
}: {
  kind: 'project' | 'board';
  value: string;
  help: string;
  onClose(): void;
  onRename(name: string): void;
}) {
  const [name, setName] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Select the name once the dialog has opened and taken focus.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <Modal title={`Rename ${kind}`} onClose={onClose}>
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onRename(name.trim());
            close();
          }}
        >
          <div className="dialog-form">
            <div className="form-field">
              <label htmlFor="rename-value">{kind === 'project' ? 'Project name' : 'Board name'}</label>
              <input
                id="rename-value"
                required
                autoComplete="off"
                ref={inputRef}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <p className="field-help">{help}</p>
          </div>
          <footer className="dialog-footer">
            <button className="secondary" type="button" onClick={close}>
              Cancel
            </button>
            <button className="primary" type="submit">
              Rename
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}

export function OpenProjectDialog({
  recent,
  onClose,
  onOpen,
}: {
  recent: Recent[];
  onClose(): void;
  /** Resolves to an error message when the project cannot be opened. */
  onOpen(path: string): Promise<string | null>;
}) {
  const [path, setPath] = useState('');
  const pathRef = useRef<HTMLInputElement>(null);

  const openPath = async (input: string, close: () => void) => {
    const resolved = await resolvePath(input);
    if ('error' in resolved) return showError(pathRef.current, resolved.error);
    const error = await onOpen(resolved.path);
    if (error) return showError(pathRef.current, error);
    close();
  };

  const browse = async (close: () => void) => {
    const chosen = await open({ multiple: false, directory: false, filters: markdownFilter });
    if (typeof chosen === 'string') {
      setPath(chosen);
      await openPath(chosen, close);
    }
  };

  return (
    <Modal title="Open project" onClose={onClose}>
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            openPath(path, close);
          }}
        >
          <div className="dialog-form">
            {recent.length > 0 && (
              <div className="recent-files">
                <div className="recent-label">Recent projects</div>
                {recent.map((r) => (
                  <button key={r.path} className="file-choice" type="button" onClick={() => openPath(r.path, close)}>
                    <Icon name="card" />
                    <span>
                      <b>{r.name}</b>
                      <small>{r.path}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="form-field">
              <label htmlFor="open-path">Markdown project file</label>
              <div className="file-input-row">
                <input
                  id="open-path"
                  ref={pathRef}
                  placeholder="~/Projects/my-project.md"
                  required
                  autoComplete="off"
                  autoFocus
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value);
                    e.target.setCustomValidity('');
                  }}
                />
                <button className="browse-button" type="button" onClick={() => browse(close)}>
                  Browse...
                </button>
              </div>
              <p className="field-help">One file contains the project and all of its boards.</p>
            </div>
          </div>
          <footer className="dialog-footer">
            <button className="secondary" type="button" onClick={close}>
              Cancel
            </button>
            <button className="primary" type="submit">
              Open project
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
