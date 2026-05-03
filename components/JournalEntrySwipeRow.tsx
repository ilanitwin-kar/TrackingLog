"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

/** רוחב מלא של הרצועה שנחשפת בהחלקה ימינה */
const MAX_DRAG_PX = 168;
/** נעילה פתוחה — רואים את «העבר אל» */
const SNAP_OPEN_PX = 84;
/** מעבר לסף — מחיקה בשחרור (גבוה יותר = פחות מחיקות מקריות בטעות) */
const DELETE_AT_PX = 142;
/** מתחת לכך נסגר לגמרי */
const CLOSE_BELOW_PX = 36;

function eventTargetElement(
  e: Pick<PointerEvent<Element>, "target">
): Element | null {
  const t = e.target;
  if (t instanceof Element) return t;
  if (t instanceof Text && t.parentElement) return t.parentElement;
  return null;
}

export function JournalEntrySwipeRow({
  children,
  disabled,
  onMove,
  onDelete,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  /** סנכרון לערך האחרון בעת שחרור — לא להסתמך על state/async בסף המחיקה */
  const offsetRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number | null;
    startClientX: number;
    startClientY: number;
    baseOffset: number;
    cancelled: boolean;
    maxDxMag: number;
  }>({
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    baseOffset: 0,
    cancelled: false,
    maxDxMag: 0,
  });

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const onPointerDownCapture = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const el = eventTargetElement(e);
      if (!el || el.closest("[data-journal-no-swipe]")) return;
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        baseOffset: offset,
        cancelled: false,
        maxDxMag: 0,
      };
      setIsDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [disabled, offset]
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    const rawDx = e.clientX - dragRef.current.startClientX;
    const dxMag = Math.abs(rawDx);
    const dy = e.clientY - dragRef.current.startClientY;
    if (
      !dragRef.current.cancelled &&
      Math.abs(dy) > 28 &&
      Math.abs(dy) > dxMag * 1.25
    ) {
      dragRef.current.cancelled = true;
      offsetRef.current = dragRef.current.baseOffset;
      setOffset(dragRef.current.baseOffset);
      return;
    }
    if (dragRef.current.cancelled) return;

    dragRef.current.maxDxMag = Math.max(dragRef.current.maxDxMag, dxMag);
    const base = dragRef.current.baseOffset;
    /** סגור: משיכה בכל כיוון אופקי; פתוח נעול («העבר אל»): תזוזה חתומה לסגירה / המשך */
    const next =
      base === 0
        ? Math.min(MAX_DRAG_PX, dxMag)
        : Math.min(MAX_DRAG_PX, Math.max(0, base + rawDx));
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const finishPointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (dragRef.current.pointerId !== e.pointerId) return;
      const cancelled = dragRef.current.cancelled;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current.pointerId = null;
      dragRef.current.cancelled = false;
      setIsDragging(false);

      if (cancelled) return;

      const ox = offsetRef.current;
      const maxDx = dragRef.current.maxDxMag;
      const minDragForDelete = 52;
      if (ox >= DELETE_AT_PX && maxDx >= minDragForDelete) {
        offsetRef.current = 0;
        setOffset(0);
        onDelete();
        return;
      }
      const minDragForSnap = 12;
      if (ox >= CLOSE_BELOW_PX && maxDx >= minDragForSnap) {
        offsetRef.current = SNAP_OPEN_PX;
        setOffset(SNAP_OPEN_PX);
        return;
      }
      offsetRef.current = 0;
      setOffset(0);
    },
    [onDelete]
  );

  const handleMoveClick = useCallback(
    (ev: React.MouseEvent) => {
      ev.stopPropagation();
      onMove();
      offsetRef.current = 0;
      setOffset(0);
    },
    [onMove]
  );

  return (
    <div className="relative overflow-hidden rounded-xl app-ui-no-select">
      <div
        className="absolute inset-y-0 left-0 z-0 flex h-full min-h-[3.25rem] overflow-hidden rounded-l-xl shadow-inner"
        style={{ width: MAX_DRAG_PX }}
      >
        <button
          type="button"
          className="flex min-h-[3.25rem] flex-none items-center justify-center bg-[var(--cherry-muted)] px-2 text-xs font-extrabold text-[var(--cherry)] transition-colors hover:bg-[var(--cherry-muted)]/90"
          style={{ width: SNAP_OPEN_PX }}
          onClick={handleMoveClick}
        >
          העבר אל…
        </button>
        <div
          className="flex min-h-[3.25rem] flex-1 items-center justify-center bg-red-600 px-2 text-center text-xs font-extrabold leading-snug text-white"
          aria-hidden
        >
          המשיכו למחיקה
        </div>
      </div>
      <div
        className={`relative z-10 min-h-[3.25rem] rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white ${
          isDragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={{
          transform: `translateX(${offset}px)`,
          touchAction: "pan-y",
          boxShadow: "var(--list-row-shadow)",
        }}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        {children}
      </div>
    </div>
  );
}
