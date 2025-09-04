// src/x/ui/ToTopButton.jsx
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

/**
 * ToTopButton
 * - Appears when scrolled beyond `threshold` (default: 240px)
 * - By default listens to window scroll; pass `targetEl` to watch a specific container
 * - Position: bottom-center (fixed) – style via .sv-to-top classes
 */
export default function ToTopButton(props) {
  const app = useApp();
  const threshold = typeof props.threshold === "number" ? props.threshold : 240;

  const [visible, setVisible] = createSignal(false);

  let el; // button node (not strictly needed, but handy if you want to focus etc.)

  function getScrollTop() {
    const t = props.targetEl;
    if (t && t.scrollTop != null) return t.scrollTop;
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  function onScroll() {
    setVisible(getScrollTop() > threshold);
  }

  function scrollToTop() {
    const t = props.targetEl;
    if (t && typeof t.scrollTo === "function") {
      t.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  onMount(() => {
    const target = props.targetEl || window;
    target.addEventListener("scroll", onScroll, { passive: true });
    // initial state
    onScroll();

    onCleanup(() => {
      target.removeEventListener("scroll", onScroll);
    });
  });

  return (
    <Show when={visible()}>
      <button
        ref={el}
        type="button"
        class={`sv-to-top ${props.class || ""}`}
        aria-label={app.t("ui.toTop")}
        title={app.t("ui.toTop")}
        onClick={scrollToTop}
      >
        {/* up arrow */}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 4l-7 7m7-7l7 7M12 4v16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </Show>
  );
}
