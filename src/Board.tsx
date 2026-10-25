import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COLUMNS, type Board as BoardData, type Card } from './format';
import { Icon } from './icons';

interface Props {
  board: BoardData;
  canEdit: boolean;
  onAddCard(column: number, title: string): void;
  onMoveCard(cardId: string, column: number, index: number): void;
  onOpenCard(cardId: string): void;
}

/** A card being dragged: where its placeholder is, and how the floating copy is held. */
interface Drag {
  card: Card;
  column: number;
  index: number;
  width: number;
  height: number;
  /** Pointer offset inside the card. */
  dx: number;
  dy: number;
  /** Where the floating copy starts; after that it follows the pointer directly. */
  left: number;
  top: number;
}

const DRAG_THRESHOLD = 5;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function TicketContent({ card }: { card: Card }) {
  const done = card.checklist.filter((item) => item.done).length;
  return (
    <>
      <span className="ticket-title">{card.title}</span>
      {card.checklist.length > 0 && (
        <span className="ticket-meta">
          <Icon name="checklist" /> {done} / {card.checklist.length}
        </span>
      )}
    </>
  );
}

export function Board({ board, canEdit, onAddCard, onMoveCard, onOpenCard }: Props) {
  const [composing, setComposing] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const addButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const tickets = useRef(new Map<string, HTMLElement>());
  const before = useRef<Map<string, DOMRect> | null>(null);
  const suppressClickUntil = useRef(0);
  // The latest values for the document-level pointer handlers.
  const live = useRef({ board, canEdit, onMoveCard });
  live.current = { board, canEdit, onMoveCard };

  const cancelComposer = (column: number) => {
    setComposing(null);
    requestAnimationFrame(() => addButtons.current[column]?.focus());
  };

  // Slide cards from where they were to where they are now.
  useLayoutEffect(() => {
    const rects = before.current;
    before.current = null;
    if (!rects || reducedMotion()) return;
    for (const [id, node] of tickets.current) {
      const was = rects.get(id);
      if (!was) continue;
      const now = node.getBoundingClientRect();
      const x = was.left - now.left;
      const y = was.top - now.top;
      if (x || y) {
        node.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], {
          duration: 160,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
      }
    }
  }, [drag?.column, drag?.index]);

  useEffect(() => {
    let pending: { cardId: string; node: HTMLElement; x: number; y: number; pointer: number } | null = null;
    let pointer = { x: 0, y: 0 };
    let frame = 0;
    let ending = false;
    // The handlers keep their own copy of the drag, since React may not have applied the latest state yet.
    let current: Drag | null = null;
    const update = (next: Drag | null) => {
      current = next;
      setDrag(next);
    };
    const area = () => rootRef.current?.closest('.board-area') as HTMLElement | null;

    const remember = () => {
      for (const node of tickets.current.values()) node.getAnimations().forEach((a) => a.cancel());
      before.current = new Map([...tickets.current].map(([id, node]) => [id, node.getBoundingClientRect()]));
    };

    const moveGhost = () => {
      const d = current;
      if (d && ghostRef.current) {
        ghostRef.current.style.left = `${pointer.x - d.dx}px`;
        ghostRef.current.style.top = `${pointer.y - d.dy}px`;
      }
    };

    /** Moves the placeholder to the spot under the pointer. */
    const place = () => {
      const d = current;
      const root = rootRef.current;
      if (!d || !root) return;
      const hit = document.elementFromPoint(pointer.x, pointer.y);
      let columnEl = hit?.closest<HTMLElement>('.column');
      if (!columnEl && hit && area()?.contains(hit)) {
        columnEl = [...root.querySelectorAll<HTMLElement>('.column')].find((c) => {
          const r = c.getBoundingClientRect();
          return pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top;
        });
      }
      if (!columnEl || !root.contains(columnEl)) return;
      const column = Number(columnEl.dataset.col);
      const cards = [...columnEl.querySelectorAll<HTMLElement>('.ticket')];
      let index = cards.findIndex((n) => {
        const r = n.getBoundingClientRect();
        return pointer.y < r.top + r.height / 2;
      });
      if (index < 0) index = cards.length;
      if (column === d.column && index === d.index) return;
      remember();
      update({ ...d, column, index });
    };

    const autoScroll = () => {
      const el = area();
      if (!current || ending || !el) return;
      const r = el.getBoundingClientRect();
      const dx = pointer.x > r.right - 65 ? 14 : pointer.x < r.left + 65 ? -14 : 0;
      const dy = pointer.y > r.bottom - 55 ? 12 : pointer.y < r.top + 45 ? -12 : 0;
      if (dx || dy) {
        el.scrollBy(dx, dy);
        place();
      }
      frame = requestAnimationFrame(autoScroll);
    };

    const begin = () => {
      const p = pending!;
      pending = null;
      const found = live.current.board.columns
        .map((cards, column) => ({ column, index: cards.findIndex((c) => c.id === p.cardId) }))
        .find((f) => f.index >= 0);
      if (!found) return;
      const r = p.node.getBoundingClientRect();
      document.body.classList.add('drag-active');
      update({
        card: live.current.board.columns[found.column][found.index],
        column: found.column,
        index: found.index,
        width: r.width,
        height: r.height,
        dx: p.x - r.left,
        dy: p.y - r.top,
        left: pointer.x - (p.x - r.left),
        top: pointer.y - (p.y - r.top),
      });
      frame = requestAnimationFrame(autoScroll);
    };

    const end = (commit: boolean) => {
      pending = null;
      const d = current;
      if (!d || ending) return;
      ending = true;
      cancelAnimationFrame(frame);
      suppressClickUntil.current = performance.now() + 450;
      const finish = () => {
        ending = false;
        document.body.classList.remove('drag-active');
        if (commit) live.current.onMoveCard(d.card.id, d.column, d.index);
        update(null);
      };
      const ghost = ghostRef.current;
      const slot = slotRef.current;
      if (commit && ghost && slot && !reducedMotion()) {
        const r = slot.getBoundingClientRect();
        ghost
          .animate(
            [
              { left: ghost.style.left, top: ghost.style.top, transform: 'rotate(1.5deg) scale(1.025)' },
              { left: `${r.left}px`, top: `${r.top}px`, transform: 'rotate(0) scale(1)' },
            ],
            { duration: 120, easing: 'ease-out', fill: 'forwards' },
          )
          .finished.then(finish, finish);
      } else finish();
    };

    const onDown = (e: PointerEvent) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.ticket[data-id]');
      if (!node || e.button !== 0 || !live.current.canEdit || !rootRef.current?.contains(node)) return;
      pending = { cardId: node.dataset.id!, node, x: e.clientX, y: e.clientY, pointer: e.pointerId };
    };
    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (pending && e.pointerId === pending.pointer && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > DRAG_THRESHOLD) {
        begin();
      } else if (current && !live.current.board.columns.some((cards) => cards.some((c) => c.id === current!.card.id))) {
        // An outside edit removed the card being dragged.
        end(false);
      } else if (current) {
        moveGhost();
        place();
      }
      if (current) e.preventDefault();
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && current) {
        e.preventDefault();
        e.stopPropagation();
        end(false);
      }
    };

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onCancel);
    return () => {
      cancelAnimationFrame(frame);
      document.body.classList.remove('drag-active');
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onCancel);
    };
  }, []);

  const slot = drag && <div ref={slotRef} className="drag-slot" style={{ height: drag.height }} aria-label="Drop position" />;

  return (
    <div className="board" ref={rootRef} onDragStart={(e) => e.preventDefault()}>
      {COLUMNS.map((name, i) => {
        const cards = board.columns[i].filter((c) => c.id !== drag?.card.id);
        return (
          <section key={name} className="column" data-col={i} aria-label={name}>
            <header className="column-head">
              <span>{name}</span>
            </header>
            <div className="cards">
              {cards.map((card, position) => (
                <FragmentWithSlot key={card.id} slot={drag?.column === i && drag.index === position ? slot : null}>
                  <button
                    ref={(el) => void (el ? tickets.current.set(card.id, el) : tickets.current.delete(card.id))}
                    className="ticket"
                    data-id={card.id}
                    onClick={() => performance.now() >= suppressClickUntil.current && onOpenCard(card.id)}
                  >
                    <TicketContent card={card} />
                  </button>
                </FragmentWithSlot>
              ))}
              {drag?.column === i && drag.index >= cards.length && slot}
              {composing === i && canEdit && (
                <Composer
                  onAdd={(title) => {
                    onAddCard(i, title);
                    setComposing(null);
                  }}
                  onCancel={() => cancelComposer(i)}
                />
              )}
            </div>
            <button
              ref={(el) => void (addButtons.current[i] = el)}
              className="add-card"
              hidden={composing === i && canEdit}
              disabled={!canEdit}
              onClick={() => setComposing(i)}
            >
              <Icon name="plus" />
              Add card
            </button>
          </section>
        );
      })}
      {drag && (
        <div ref={ghostRef} className="ticket drag-ghost" aria-hidden="true" style={{ width: drag.width, height: drag.height, left: drag.left, top: drag.top }}>
          <TicketContent card={drag.card} />
        </div>
      )}
    </div>
  );
}

function FragmentWithSlot({ slot, children }: { slot: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {slot}
      {children}
    </>
  );
}

function Composer({ onAdd, onCancel }: { onAdd(title: string): void; onCancel(): void }) {
  const [title, setTitle] = useState('');
  const submit = () => {
    if (title.trim()) onAdd(title.trim());
  };
  return (
    <form
      className="creation-form inline-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        placeholder="What needs doing?"
        aria-label="New card title"
        rows={3}
        required
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          // Titles are one line in the file, so Enter always submits.
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="composer-actions">
        <button className="primary" type="submit">
          Add card
        </button>
        <button type="button" className="icon-button" aria-label="Cancel new card" onClick={onCancel}>
          <Icon name="x" />
        </button>
      </div>
    </form>
  );
}
