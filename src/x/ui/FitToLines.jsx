// src/x/ui/FitToLines.jsx
import { createSignal, createEffect, onMount, onCleanup } from "solid-js";

/**
 * Fits text into <= maxLines by shrinking font-size between [minRem, maxRem].
 * If it still doesn't fit at minRem, it line-clamps to maxLines with ellipsis.
 *
 * Props:
 *   - maxLines: number (default 8)
 *   - minRem: number (default 0.75)  // ~12px if 1rem=16px
 *   - maxRem: number (default 0.875) // ~14px, matches `text-sm`
 *   - class: string (optional)
 */
export default function FitToLines(props) {
  let el;
  const maxLines = props.maxLines ?? 8;
  const minRem = props.minRem ?? 0.75;
  const maxRem = props.maxRem ?? 0.875;

  const [fontRem, setFontRem] = createSignal(maxRem);
  const [clamped, setClamped] = createSignal(false);

  // Compute a reliable line-height in px (fallback for "normal")
  const getLineHeightPx = () => {
    const cs = window.getComputedStyle(el);
    const lh = cs.lineHeight;
    if (lh === "normal") {
      const fs = parseFloat(cs.fontSize || "16");
      return 1.2 * fs; // conservative fallback
    }
    return parseFloat(lh || "0");
  };

  const fits = () => {
    const lineHeight = getLineHeightPx();
    // small fudge factor to account for rounding
    const maxHeight = lineHeight * maxLines + 1;
    return el.scrollHeight <= maxHeight;
  };

  const measureAndFit = () => {
    if (!el) return;
    setClamped(false);

    // Start from the max and iteratively shrink
    let current = maxRem;
    el.style.fontSize = `${current}rem`;

    // Iterate (fast converge using ratio)
    let tries = 0;
    while (tries < 10 && !fits() && current > minRem) {
      const lineHeight = getLineHeightPx();
      const maxHeight = lineHeight * maxLines + 1;
      const ratio = maxHeight / el.scrollHeight; // < 1 when overflowing
      // take a small safety margin to avoid oscillation
      current = Math.max(minRem, current * ratio * 0.98);
      el.style.fontSize = `${current}rem`;
      tries++;
    }

    setFontRem(current);
    // If we’re still overflowing at minRem, clamp to maxLines for ellipsis
    setClamped(!fits() && current <= minRem + 0.001);
  };

  onMount(() => {
    // Initial measure on next frame (ensures DOM is painted)
    const raf = requestAnimationFrame(measureAndFit);

    // Re-measure on window/container resize
    const ro = new ResizeObserver(() => measureAndFit());
    ro.observe(el);

    window.addEventListener("resize", measureAndFit);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measureAndFit);
    });
  });

  // Re-measure when children content changes
  createEffect(() => {
    // Accessing children makes Solid track reactive dependencies inside it (if any)
    // and retrigger this effect.
    // eslint-disable-next-line no-unused-expressions
    props.children;
    // Defer to next microtask to ensure text is in the DOM
    queueMicrotask(measureAndFit);
  });

  return (
    <div
      ref={el}
      class={props.class}
      style={{
        "font-size": `${fontRem()}rem`,
        // Clamp only if we couldn’t fit at min size
        display: clamped() ? "-webkit-box" : undefined,
        "-webkit-line-clamp": clamped() ? String(maxLines) : undefined,
        "-webkit-box-orient": clamped() ? "vertical" : undefined,
        overflow: clamped() ? "hidden" : undefined,
        // Helps prevent awkward breaks in long tokens
        "word-break": "break-word"
      }}
    >
      {props.children}
    </div>
  );
}
