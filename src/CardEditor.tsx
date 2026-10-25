import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Extension } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import type { Card, ChecklistItem } from './format';
import { Icon, type IconName } from './icons';
import { HEADING_LEVEL, descriptionExtensions, describedText, docToMarkdown, loadDescription, type DescriptionSource } from './markdown';

interface Props {
  card: Card;
  boardName: string;
  columnName: string;
  onSave(card: Card): void;
  onDelete(): void;
  onClose(): void;
}

type Mode = 'visual' | 'markdown';

// Tab indents inside a code block instead of leaving the editor.
const CodeTab = Extension.create({
  name: 'codeTab',
  addKeyboardShortcuts() {
    return {
      Tab: () =>
        this.editor.isActive('codeBlock') &&
        this.editor.commands.command(({ tr }) => {
          tr.insertText('  ');
          return true;
        }),
    };
  },
});

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.matches('textarea, input:not([type=checkbox]):not([type=radio])'));

export function CardEditor({ card, boardName, columnName, onSave, onDelete, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(card.title);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(card.checklist);
  const [mode, setMode] = useState<Mode>('visual');
  const [markdown, setMarkdown] = useState(card.description);
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  // Loaded once; the editor's options are rebuilt on every render.
  const [initial] = useState(() => loadDescription(card.description));
  const source = useRef<DescriptionSource>(initial.source);
  // Undo for checklist changes; text fields and the description keep their own undo.
  const past = useRef<ChecklistItem[][]>([]);
  const future = useRef<ChecklistItem[][]>([]);

  const editor = useEditor({
    extensions: [...descriptionExtensions, Placeholder.configure({ placeholder: 'Add a description…' }), CodeTab],
    content: initial.doc,
    // The editor may normalize content as it loads it (an empty paragraph after a code block),
    // so "untouched" is measured against what the editor holds, not the parsed text.
    onCreate: ({ editor: e }) => {
      source.current.normalized = docToMarkdown(e.getJSON());
    },
    editorProps: {
      attributes: { class: 'description', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Description', spellcheck: 'false' },
      handleKeyDown: (_, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          openLink();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    dialogRef.current?.showModal();
    titleRef.current?.focus();
  }, []);

  // The title grows with its text, up to a limit.
  useLayoutEffect(() => {
    const t = titleRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 170)}px`;
    t.style.overflowY = t.scrollHeight > 170 ? 'auto' : 'hidden';
  }, [title]);

  const description = () => {
    if (mode === 'markdown' || !editor) return markdown;
    return describedText(source.current, editor.getJSON());
  };

  const switchMode = (next: Mode) => {
    if (next === mode || !editor) return;
    if (next === 'markdown') setMarkdown(description());
    else {
      const loaded = loadDescription(markdown);
      source.current = loaded.source;
      editor.commands.setContent(loaded.doc, { emitUpdate: false });
      source.current.normalized = docToMarkdown(editor.getJSON());
    }
    setLinking(false);
    setMode(next);
  };

  const editChecklist = (next: ChecklistItem[]) => {
    past.current.push(checklist);
    future.current = [];
    setChecklist(next);
  };

  const travelChecklist = (redo: boolean) => {
    const from = redo ? future.current : past.current;
    const to = redo ? past.current : future.current;
    const restored = from.pop();
    if (!restored) return;
    to.push(checklist);
    setChecklist(restored);
  };

  function openLink() {
    setLinkUrl(editor?.getAttributes('link').href ?? '');
    setLinkError('');
    setLinking(true);
    requestAnimationFrame(() => linkRef.current?.focus());
  }

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setLinkError('Use an http or https link.');
      return;
    }
    if (!editor) return;
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else chain.extendMarkRange('link').setLink({ href: url }).run();
    setLinking(false);
  };

  const closeLink = () => {
    setLinking(false);
    editor?.commands.focus();
  };

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      titleRef.current?.focus();
      return;
    }
    const next: Card = { ...card, title: trimmed, description: description(), checklist };
    if (JSON.stringify(next) !== JSON.stringify(card)) onSave(next);
    else onClose();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // Escape closes the link popup first, then the card. Handled here rather than through the
    // dialog's cancel event, which Chromium stops sending after one has been cancelled.
    if (e.key === 'Escape') {
      e.preventDefault();
      if (linking) closeLink();
      else onClose();
      return;
    }
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y') && !isTextField(e.target)) {
      e.preventDefault();
      travelChecklist(key === 'y' || e.shiftKey);
    }
  };

  const done = checklist.filter((item) => item.done).length;

  return (
    <dialog
      ref={dialogRef}
      id="editor"
      aria-label="Edit card"
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <header className="editor-head">
        <span className="card-location">
          <Icon name="card" />
          <span id="card-board">{boardName}</span>
          <span style={{ color: 'var(--dim)' }}>/</span>
          <span className="status-dot" />
          <span>{columnName}</span>
        </span>
        <button className="icon-button" aria-label="Close card" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      <div className="editor-body">
        <textarea
          ref={titleRef}
          className="title-input"
          aria-label="Card title"
          rows={1}
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, ' '))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (mode === 'visual') editor?.commands.focus('start');
              else document.getElementById('markdown')?.focus();
            }
          }}
        />
        <div className="field-heading">
          <span>Description</span>
          <div
            className="mode-switch"
            role="tablist"
            aria-label="Description editor"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = mode === 'visual' ? 'markdown' : 'visual';
                switchMode(next);
                requestAnimationFrame(() => document.getElementById(`${next}-mode`)?.focus());
              }
            }}
          >
            <button id="visual-mode" role="tab" aria-selected={mode === 'visual'} aria-controls="visual-panel" onClick={() => switchMode('visual')}>
              <Icon name="edit" />
              Visual
            </button>
            <button id="markdown-mode" role="tab" aria-selected={mode === 'markdown'} aria-controls="markdown-panel" onClick={() => switchMode('markdown')}>
              <Icon name="code" />
              Markdown
            </button>
          </div>
        </div>
        <div className="rich-editor">
          <div id="visual-panel" role="tabpanel" aria-labelledby="visual-mode" hidden={mode !== 'visual'}>
            {editor && <Toolbar editor={editor} onLink={openLink} />}
            <EditorContent editor={editor} />
          </div>
          <div id="markdown-panel" role="tabpanel" aria-labelledby="markdown-mode" hidden={mode !== 'markdown'}>
            <textarea
              id="markdown"
              className="markdown"
              aria-label="Markdown description"
              spellCheck={false}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
            />
          </div>
          {linking && (
            <div className="link-popup">
              <input
                ref={linkRef}
                type="url"
                placeholder="https://example.com"
                aria-label="Link URL"
                aria-invalid={Boolean(linkError)}
                title={linkError || undefined}
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setLinkError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLink();
                  }
                }}
              />
              <button className="primary" onClick={applyLink}>
                Apply
              </button>
              <button className="icon-button" aria-label="Cancel link" onClick={closeLink}>
                <Icon name="x" />
              </button>
              {linkError && (
                <p className="link-error" role="alert">
                  {linkError}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="field-heading check-heading">
          <span>Checklist</span>
          <span className="check-progress">{checklist.length ? `${done} of ${checklist.length}` : ''}</span>
        </div>
        <div ref={checklistRef}>
          {checklist.map((item, i) => (
            <div key={i} className={`check-row ${item.done ? 'done' : ''}`}>
              <input
                type="checkbox"
                aria-label={`Complete checklist item ${i + 1}`}
                checked={item.done}
                onChange={(e) => editChecklist(checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
              />
              <input
                className="item-text"
                aria-label={`Checklist item ${i + 1}`}
                value={item.text}
                onChange={(e) => setChecklist(checklist.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
              <button
                className="icon-button item-remove"
                aria-label={`Remove checklist item ${i + 1}`}
                onClick={() => editChecklist(checklist.filter((_, j) => j !== i))}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
        <button
          className="add-item"
          onClick={() => {
            editChecklist([...checklist, { text: '', done: false }]);
            requestAnimationFrame(() => checklistRef.current?.querySelector<HTMLInputElement>('.check-row:last-child .item-text')?.focus());
          }}
        >
          <Icon name="plus" />
          Add an item
        </button>
      </div>
      <footer className="editor-footer">
        <button className="delete-card" onClick={onDelete}>
          <Icon name="trash" />
          Delete card
        </button>
        <div className="footer-actions">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={save}>
            Save
          </button>
        </div>
      </footer>
    </dialog>
  );
}

const tools: { name: string; icon: IconName; label: string; tip: string; run(e: Editor): void; active?(e: Editor): boolean }[][] = [
  [
    { name: 'bold', icon: 'bold', label: 'Bold', tip: 'Bold · Ctrl+B', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
    { name: 'italic', icon: 'italic', label: 'Italic', tip: 'Italic · Ctrl+I', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
    { name: 'strike', icon: 'strike', label: 'Strikethrough', tip: 'Strikethrough', run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
  ],
  [
    { name: 'bullets', icon: 'bullets', label: 'Bulleted list', tip: 'Bulleted list', run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
    { name: 'numbers', icon: 'numbers', label: 'Numbered list', tip: 'Numbered list', run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  ],
  [
    { name: 'quote', icon: 'quote', label: 'Block quote', tip: 'Block quote', run: (e) => e.chain().focus().toggleBlockquote().run() },
    { name: 'code', icon: 'codeblock', label: 'Code block', tip: 'Code block', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  ],
];

const pressable = new Set(['bold', 'italic', 'strike', 'bullets', 'numbers']);

function Toolbar({ editor, onLink }: { editor: Editor; onLink(): void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: e.isActive('heading'),
      ...Object.fromEntries(tools.flat().map((t) => [t.name, t.active?.(e) ?? false])),
    }),
  }) as Record<string, boolean>;

  return (
    // Keep the editor's selection when a button is pressed.
    <div className="toolbar" role="toolbar" aria-label="Text formatting" onMouseDown={(e) => (e.target as HTMLElement).closest('button') && e.preventDefault()}>
      <select
        className="text-style"
        aria-label="Text style"
        value={state.heading ? 'heading' : 'paragraph'}
        onChange={(e) => {
          const chain = editor.chain().focus();
          if (e.target.value === 'heading') chain.setHeading({ level: HEADING_LEVEL }).run();
          else chain.setParagraph().run();
        }}
      >
        <option value="paragraph">Paragraph</option>
        <option value="heading">Heading</option>
      </select>
      {tools.map((group, g) => (
        <span key={g} style={{ display: 'contents' }}>
          <span className="tool-separator" />
          <div className="tool-group">
            {group.map((t) => (
              <button
                key={t.name}
                className="tool"
                aria-label={t.label}
                aria-pressed={pressable.has(t.name) ? state[t.name] : undefined}
                data-tip={t.tip}
                onClick={() => t.run(editor)}
              >
                <Icon name={t.icon} />
              </button>
            ))}
            {g === tools.length - 1 && (
              <>
                <button className="tool" aria-label="Insert link" data-tip="Link · Ctrl+K" onClick={onLink}>
                  <Icon name="link" />
                </button>
                <button className="tool" aria-label="Divider" data-tip="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
                  <Icon name="minus" />
                </button>
              </>
            )}
          </div>
        </span>
      ))}
    </div>
  );
}

