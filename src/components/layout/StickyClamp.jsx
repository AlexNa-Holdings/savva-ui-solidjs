// src/components/layout/StickyClamp.jsx
import { onMount, onCleanup, createSignal } from "solid-js";

/**
 * StickyClamp
 * - Short content: behaves like regular sticky (top = offsetTop).
 * - Tall content: keeps moving until the bottom is visible, then clamps.
 * No extra scrollbars; no layout jumps.
 */
export default function StickyClamp(props) {
  let root;   // wrapper occupying the grid cell
  let inner;  // actual panel we move slightly when clamping

  const offsetTop = () => Number(props.offsetTop ?? 64); // px (e.g., header + breathing)
  const [topCss, setTopCss] = createSignal(offsetTop()); // sticky top we expose to CSS

  function update() {
    if (!root || !inner) return;

    // current geometry
    const viewport = window.innerHeight || 0;
    const scrollY  = window.scrollY || 0;
    const rootTop  = root.getBoundingClientRect().top + scrollY; // doc Y
    const panelH   = inner.offsetHeight || 0;

    // If the panel fits, use classic sticky and zero shift.
    if (panelH <= viewport - offsetTop()) {
      setTopCss(offsetTop());
      inner.style.transform = "";
      inner.style.width = "";
      inner.style.position = "";
      return;
    }

    // When the panel is taller than the viewport:
    // 1) Delay sticky so that it starts when the bottom can be visible.
    //    (negative top makes sticky engage later)
    const delayedTop = viewport - panelH;
    setTopCss(Math.min(offsetTop(), delayedTop));

    // 2) While the wrapper is pinned at `topCss`, keep sliding the inner up
    //    until the bottom is fully visible, then clamp.
    const sincePinned = scrollY - (rootTop - topCss());
    const maxShift    = panelH - viewport + offsetTop(); // how much we must reveal
    const shift       = Math.max(0, Math.min(maxShift, sincePinned));

    // Translate the inner block up by `shift` pixels.
    inner.style.transform = `translateY(${-shift}px)`;
    // Keep width fixed so it doesn’t reflow when we translate.
    inner.style.width = `${root.offsetWidth}px`;
    inner.style.position = "relative";
  }

  function onResize() { update(); }
  function onScroll() { update(); }

  onMount(() => {
    // First compute
    update();

    // Track size changes of the panel content (images arriving, etc.).
    const ro = new ResizeObserver(() => update());
    try { ro.observe(inner); } catch {}

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    onCleanup(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      try { ro.disconnect(); } catch {}
    });
  });

  return (
    <aside
      ref={el => (root = el)}
      class={props.class}
      style={{ position: "sticky", top: `${topCss()}px` }}
    >
      <div ref={el => (inner = el)}>
        {props.children}
      </div>
    </aside>
  );
}
