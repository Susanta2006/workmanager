import { useEffect, useRef, useState, type ReactNode } from "react";

/** A4 width at 96 dpi. The paper is always laid out at this width, on every screen. */
export const PAPER_PX = 794;

/**
 * Shows the paper at its full desktop layout and scales the whole page down to fit the
 * screen. Tables, totals and the signature keep their desktop proportions on phones, and
 * nothing is hidden or squeezed. The transform is cleared on print, so printing is unscaled.
 */
export default function FitToWidth({ children, className = "" }: { children: ReactNode; className?: string }) {
  const measure = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const box = measure.current;
    const page = content.current;
    if (!box || !page) return;
    const update = () => {
      const available = box.clientWidth;
      const s = Math.min(1, available / PAPER_PX);
      setScale(s);
      setHeight(page.offsetHeight * s);
      setOffset(Math.max(0, (available - PAPER_PX * s) / 2));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`doc-fit-outer ${className}`}>
      <div ref={measure} className="doc-fit-measure" style={{ height }}>
        <div
          ref={content}
          className="doc-fit"
          style={{
            width: PAPER_PX,
            marginLeft: offset,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
