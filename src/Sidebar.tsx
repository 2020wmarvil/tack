import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Project } from './format';
import { fileName } from './files';
import { Icon } from './icons';
import type { Recent } from './recent';
import logo from './assets/tack.svg';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

interface Props {
  project: Project | null;
  path: string | null;
  recent: Recent[];
  boardIndex: number;
  addingBoard: boolean;
  canEdit: boolean;
  onSelectProject(path: string): void;
  onOpenProject(): void;
  onNewProject(): void;
  onRenameProject(): void;
  onSelectBoard(index: number): void;
  onDeleteBoard(id: string): void;
  onAddingBoard(adding: boolean): void;
  onAddBoard(name: string): void;
}

export function Sidebar(props: Props) {
  const { project, path, recent, boardIndex, addingBoard } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addBoardRef = useRef<HTMLButtonElement>(null);
  const focusMenuOnOpen = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;
    if (focusMenuOnOpen.current) menuRef.current?.querySelector('button')?.focus();
    focusMenuOnOpen.current = false;
    const close = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const closeMenu = (focus = false) => {
    setMenuOpen(false);
    if (focus) triggerRef.current?.focus();
  };
  const choose = (action: () => void) => {
    closeMenu();
    action();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll('button') ?? [])];
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand" data-tauri-drag-region>
        <img src={logo} alt="" />
        tack
      </div>
      <div className="project-picker" ref={pickerRef}>
        <button
          ref={triggerRef}
          className="project-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls="project-menu"
          title={project?.name ?? 'Open a project'}
          onClick={() => setMenuOpen(!menuOpen)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusMenuOnOpen.current = true;
              setMenuOpen(true);
            }
          }}
        >
          <span className="project-avatar">{project ? initials(project.name) : '+'}</span>
          <span className="project-caption">
            <span className="eyebrow">Project</span>
            <span className="project-name">{project?.name ?? 'Open a project'}</span>
          </span>
          <Icon name="chevrons" />
        </button>
        {menuOpen && (
          <div className="project-menu" id="project-menu" role="menu" aria-label="Projects" ref={menuRef} onKeyDown={onMenuKey}>
            {recent.length > 0 && <div className="menu-heading">Your projects</div>}
            {recent.map((r) => (
              <button
                key={r.path}
                className="project-option"
                role="menuitemradio"
                aria-checked={r.path === path}
                onClick={() => choose(() => props.onSelectProject(r.path))}
              >
                <span className="project-avatar">{initials(r.name)}</span>
                <span className="project-caption">
                  <span className="project-name">{r.name}</span>
                  <span className="project-path" title={r.path}>
                    {fileName(r.path)}
                  </span>
                </span>
                {r.path === path && <Icon name="check" />}
              </button>
            ))}
            {recent.length > 0 && <hr className="menu-divider" />}
            <button className="menu-create" role="menuitem" onClick={() => choose(props.onOpenProject)}>
              <Icon name="card" />
              Open project...
            </button>
            <button className="menu-create" role="menuitem" onClick={() => choose(props.onNewProject)}>
              <Icon name="plus" />
              New project...
            </button>
            {project && props.canEdit && (
              <>
                <hr className="menu-divider" />
                <button className="menu-create" role="menuitem" onClick={() => choose(props.onRenameProject)}>
                  <Icon name="edit" />
                  Rename project...
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div>
        <div className="section-heading">Boards</div>
        <nav className="board-nav" aria-label="Boards">
          {project?.boards.map((b, i) => (
            <div key={b.id} className={`board-row ${i === boardIndex ? 'active' : ''}`}>
              <button
                className="board-link"
                title={b.name}
                aria-current={i === boardIndex ? 'page' : undefined}
                onClick={() => props.onSelectBoard(i)}
              >
                <Icon name="card" />
                <span>{b.name}</span>
              </button>
              {props.canEdit && (
                <button className="board-delete" aria-label={`Delete ${b.name} board`} onClick={() => props.onDeleteBoard(b.id)}>
                  <Icon name="x" />
                </button>
              )}
            </div>
          ))}
        </nav>
        <button
          ref={addBoardRef}
          className="add-board"
          disabled={!props.canEdit}
          onClick={() => props.onAddingBoard(true)}
        >
          <Icon name="plus" />
          Add board
        </button>
        {addingBoard && (
          <input
            className="new-board"
            placeholder="Board name"
            aria-label="New board name"
            autoFocus
            onKeyDown={(e) => {
              const name = e.currentTarget.value.trim();
              if (e.key === 'Enter' && name) props.onAddBoard(name);
              if (e.key === 'Escape') {
                props.onAddingBoard(false);
                requestAnimationFrame(() => addBoardRef.current?.focus());
              }
            }}
          />
        )}
      </div>
    </aside>
  );
}
