"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

const MAX_DRAG_PX = 120;
const DELETE_AT_PX = 72;

function eventTargetElement(
  e: Pick<PointerEvent<Element>, "target">
): Element | null {
  const t = e.target;
  if (t instanceof Element) return t;
  if (t instanceof Text && t.parentElement) return t.parentElement;
  return null;
}

/** מילון / רשימות: החלקה — גילוי «מחק», שחרור מעל הסף מוחק */
export function DictionarySwipeDeleteRow({
  children,
  disabled,
  onDelete,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
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
      if (!el || el.closest("[data-dict-no-swipe]")) return;
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
    /** תמיד מתחילים מ־0 — משיכה ימינה או שמאלה (עכבר / RTL) חושפת את הרצועה */
    const next = Math.min(MAX_DRAG_PX, dxMag);
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
      offsetRef.current = 0;
      setOffset(0);
      const minDragForDelete = 36;
      if (ox >= DELETE_AT_PX && maxDx >= minDragForDelete) {
        onDelete();
      }
    },
    [onDelete]
  );

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        className="absolute inset-y-0 left-0 z-0 flex h-full min-h-[3rem] items-center justify-center rounded-l-xl bg-red-600 px-3 text-sm font-extrabold text-white shadow-inner"
        style={{ width: MAX_DRAG_PX }}
      >
        מחק
      </div>
      <div
        className={`relative z-10 min-h-[3rem] w-full rounded-xl bg-white ${
          isDragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={{
          transform: `translateX(${offset}px)`,
          touchAction: "pan-y",
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
