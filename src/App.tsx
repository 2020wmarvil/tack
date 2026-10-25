import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Board } from './Board';
import { deleteCard, findCard, isSamePlace, moveCard, replaceCard } from './actions';
import { CardEditor } from './CardEditor';
import { COLUMNS, emptyColumns, newId, type Board as BoardData, type Project } from './format';
import { errorText, fileName, fileStamp, readFile, writeFileAtomic } from './files';
import { Icon } from './icons';
import { NewProjectDialog, OpenProjectDialog, RenameDialog } from './ProjectDialogs';
import { ProjectFile, type FileSystem } from './projectFile';
import { loadRecent, rememberRecent } from './recent';
import { Sidebar } from './Sidebar';
import { WindowControls } from './WindowControls';
import logo from './assets/tack.svg';

const disk: FileSystem = { read: readFile, write: writeFileAtomic, stamp: fileStamp };
const POLL_MS = 1000;

type Dialog = 'new' | 'open' | 'rename-project' | 'rename-board' | null;
interface Toast {
  message: string;
  undo?: boolean;
}

/** True when the key press belongs to a text field's own undo. */
function isTextUndo(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el?.matches) return false;
  if (el.isContentEditable) return true;
  return el.matches('textarea, input:not([type=checkbox]):not([type=radio])') && Boolean((el as HTMLInputElement).value);
}

export default function App() {
  const [file, setFile] = useState<ProjectFile | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [starting, setStarting] = useState(true);
  const [recent, setRecent] = useState(loadRecent);
  // The board is remembered by id; the index is the fallback when that board is gone.
  const [selected, setSelected] = useState({ id: '', index: 0 });
  const [addingBoard, setAddingBoard] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const project = file?.project ?? null;
  const boardIndex = project
    ? (() => {
        const i = project.boards.findIndex((b) => b.id === selected.id);
        return i >= 0 ? i : Math.min(selected.index, project.boards.length - 1);
      })()
    : -1;
  const board = project?.boards[boardIndex] ?? null;
  const canEdit = Boolean(project && !file?.error);
  const selectBoard = (index: number, boards = project?.boards ?? []) => setSelected({ id: boards[index]?.id ?? '', index });

  const openProject = useCallback(async (path: string) => {
    try {
      const opened = await ProjectFile.open(path, disk, {
        onChange: rerender,
        // Outside edits win: an open card's unsaved edits are discarded.
        onExternal: () => {
          if (editingRef.current) {
            setEditing(null);
            setToast({ message: 'The file changed outside Tack, so the open card was closed.' });
          }
        },
        onMessage: (message) => setToast({ message }),
      });
      setFile(opened);
      setEditing(null);
      setSelected({ id: opened.project?.boards[0]?.id ?? '', index: 0 });
      setAddingBoard(false);
      setToast(null);
      setRecent(rememberRecent({ path, name: opened.project?.name ?? fileName(path) }));
      return null;
    } catch (e) {
      return `Couldn't open this file: ${errorText(e)}`;
    }
  }, []);

  // Reopen the last project on launch.
  useEffect(() => {
    const last = loadRecent()[0];
    (last ? openProject(last.path) : Promise.resolve()).finally(() => setStarting(false));
  }, [openProject]);

  // Watch for edits made outside Tack.
  useEffect(() => {
    if (!file) return;
    const check = () => void file.check();
    const timer = setInterval(check, POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [file]);

  // Keep the recent list's name current when the project is renamed.
  useEffect(() => {
    if (file && project && recent[0]?.path === file.path && recent[0].name !== project.name) {
      setRecent(rememberRecent({ path: file.path, name: project.name }));
    }
  }, [file, project, recent]);

  const travel = useCallback(
    (redo: boolean) => {
      if (!file) return;
      const label = redo ? file.redo() : file.undo();
      if (label) setToast({ message: `${redo ? 'Redid' : 'Undid'}: ${label}`, undo: file.canUndo });
    },
    [file],
  );

  // Ctrl+Z / Command+Z undoes, adding Shift redoes. Text fields keep their own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (document.querySelector('dialog[open]') || isTextUndo(e.target)) return;
      e.preventDefault();
      travel(key === 'y' || e.shiftKey);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [travel]);

  const change = (label: string, update: (p: Project) => Project) => {
    setToast(null);
    return file?.change(label, update) ?? false;
  };
  const updateBoard = (label: string, id: string, update: (b: BoardData) => BoardData) =>
    change(label, (p) => ({ ...p, boards: p.boards.map((b) => (b.id === id ? update(b) : b)) }));

  const addBoard = (name: string) => {
    const created = { id: newId(), name, columns: emptyColumns() };
    if (change('Create board', (p) => ({ ...p, boards: [...p.boards, created] }))) {
      setSelected({ id: created.id, index: project?.boards.length ?? 0 });
      setAddingBoard(false);
    }
  };

  const deleteBoard = (id: string) => {
    if (!project) return;
    const index = project.boards.findIndex((b) => b.id === id);
    if (!change('Delete board', (p) => ({ ...p, boards: p.boards.filter((b) => b.id !== id) }))) return;
    // Removing the open board shows the next one, or the previous at the end.
    if (id === board?.id) setSelected({ id, index: Math.min(index, project.boards.length - 2) });
    setToast({ message: 'Board deleted', undo: true });
  };

  const addCard = (column: number, title: string) => {
    if (!board) return;
    updateBoard('Create card', board.id, (b) => ({
      ...b,
      columns: b.columns.map((cards, i) => (i === column ? [...cards, { id: newId(), title, description: '', checklist: [] }] : cards)),
    }));
  };

  const move = (cardId: string, column: number, index: number) => {
    if (project && findCard(project, cardId) && !isSamePlace(project, cardId, column, index)) change('Move card', (p) => moveCard(p, cardId, column, index));
  };

  const editingCard = editing && project ? findCard(project, editing) : null;

  const welcome = !file && !starting;

  return (
    <div className="app">
      <WindowControls />
      <Sidebar
        project={project}
        path={file?.path ?? null}
        recent={recent}
        boardIndex={boardIndex}
        addingBoard={addingBoard}
        canEdit={canEdit}
        onSelectProject={async (path) => {
          const error = await openProject(path);
          if (error) setToast({ message: error });
        }}
        onOpenProject={() => setDialog('open')}
        onNewProject={() => setDialog('new')}
        onRenameProject={() => setDialog('rename-project')}
        onSelectBoard={(index) => selectBoard(index)}
        onDeleteBoard={deleteBoard}
        onAddingBoard={setAddingBoard}
        onAddBoard={addBoard}
      />
      <main className={`main ${file ? '' : 'welcome'}`}>
        <header className="board-header" data-tauri-drag-region>
          <div className="board-title-group" data-tauri-drag-region>
            <h1 onDoubleClick={() => board && canEdit && setDialog('rename-board')}>{board?.name ?? project?.name ?? 'Tack'}</h1>
            {board && canEdit && (
              <button className="icon-button rename-board" aria-label="Rename board" onClick={() => setDialog('rename-board')}>
                <Icon name="edit" />
              </button>
            )}
          </div>
          {file && (
            <span className="board-file" title={file.path}>
              {fileName(file.path)}
            </span>
          )}
        </header>
        {file?.error && project && (
          <div className="file-error" role="alert">
            <strong>Changes are paused.</strong> {file.error} Tack will reload the file when it is fixed.
          </div>
        )}
        <div className="board-area">
          {welcome && (
            <div className="empty-project">
              <img className="welcome-logo" src={logo} alt="" />
              <h2>A little room for your next idea.</h2>
              <p>
                Open a project or start a new one.
                <br />
                Each project lives in a single Markdown file.
              </p>
              <div className="empty-actions">
                <button className="primary" onClick={() => setDialog('new')}>
                  New project
                </button>
                <button className="secondary" onClick={() => setDialog('open')}>
                  Open project
                </button>
              </div>
            </div>
          )}
          {file && !project && (
            <div className="empty-project">
              <Icon name="card" className="empty-icon" />
              <h2>Tack can't read this file yet.</h2>
              <p>{file.error}</p>
              <p>Fix the file in any editor and Tack will reload it automatically.</p>
            </div>
          )}
          {project && !board && (
            <div className="empty-project">
              <Icon name="card" className="empty-icon" />
              <h2>Your first board starts here.</h2>
              <p>
                A board can hold one area of your project.
                <br />
                Give it a name and start adding cards.
              </p>
              <button className="primary" disabled={!canEdit} onClick={() => setAddingBoard(true)}>
                Add board
              </button>
            </div>
          )}
          {board && <Board key={board.id} board={board} canEdit={canEdit} onAddCard={addCard} onMoveCard={move} onOpenCard={setEditing} />}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && <button onClick={() => travel(false)}>Undo</button>}
          <button className="dismiss-toast icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <Icon name="x" />
          </button>
        </div>
      )}
      {editingCard && (
        <CardEditor
          key={editingCard.card.id}
          card={editingCard.card}
          boardName={editingCard.board.name}
          columnName={COLUMNS[editingCard.column]}
          onClose={() => setEditing(null)}
          onSave={(card) => {
            if (change('Edit card', (p) => replaceCard(p, card))) setEditing(null);
          }}
          onDelete={() => {
            const id = editingCard.card.id;
            if (change('Delete card', (p) => deleteCard(p, id))) {
              setEditing(null);
              setToast({ message: 'Card deleted', undo: true });
            }
          }}
        />
      )}
      {dialog === 'new' && (
        <NewProjectDialog
          onClose={() => setDialog(null)}
          onCreated={async (path) => {
            const error = await openProject(path);
            if (error) setToast({ message: error });
          }}
        />
      )}
      {dialog === 'open' && <OpenProjectDialog recent={recent} onClose={() => setDialog(null)} onOpen={openProject} />}
      {dialog === 'rename-project' && project && file && (
        <RenameDialog
          kind="project"
          value={project.name}
          help={`This changes the display name. Your project file stays at ${file.path}`}
          onClose={() => setDialog(null)}
          onRename={(name) => name !== project.name && change('Rename project', (p) => ({ ...p, name }))}
        />
      )}
      {dialog === 'rename-board' && board && (
        <RenameDialog
          kind="board"
          value={board.name}
          help="The board stays in the same project file."
          onClose={() => setDialog(null)}
          onRename={(name) => name !== board.name && updateBoard('Rename board', board.id, (b) => ({ ...b, name }))}
        />
      )}
    </div>
  );
}
