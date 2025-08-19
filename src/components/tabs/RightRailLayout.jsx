// src/components/tabs/RightRailLayout.jsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

const HEADER_H = 48; // header height used for min page height

export default function RightRailLayout(props) {
  const { t } = useApp();
  const Panel = props.PanelComponent;

  let asideRef;
  const [stickyTop, setStickyTop] = createSignal(HEADER_H); // will be updated to the *actual* initial top

  function measure() {
    if (!asideRef) return;
    // Distance from viewport top to the rail's current visual top
    const top = Math.ceil(asideRef.getBoundingClientRect().top);
    // Use the measured value so the rail never moves above where it started
    setStickyTop(Math.max(HEADER_H, top));
  }

  onMount(() => {
    // Defer to the next frame so layout is settled
    requestAnimationFrame(measure);
    window.addEventListener("resize", measure, { passive: true });
  });

  onCleanup(() => {
    window.removeEventListener("resize", measure);
  });

  return (
    <section class="w-full">
      <div
        class="
          grid gap-4
          grid-cols-1
          md:grid-cols-[minmax(0,1fr)_320px]
        "
        style={{ "min-height": `calc(100vh - ${HEADER_H}px)` }}
      >
        <div>{props.children}</div>

        {/* Sticky rail that never moves above its initial position */}
        <aside
          ref={(el) => (asideRef = el)}
          class="hidden md:block"
          style={{ position: "sticky", top: `${stickyTop()}px` }}
        >
          <div
            class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]"
            style={{
              "max-height": `calc(100vh - ${stickyTop()}px)`,
              overflow: "hidden",
            }}
          >
            {/* Inner content scrolls independently when taller than the viewport area */}
            <div
              class="p-3 space-y-3 overflow-auto"
              style={{ "max-height": `calc(100vh - ${stickyTop()}px)` }}
            >
              {Panel ? (
                <Panel />
              ) : (
                <>
                  <h4 class="font-semibold">{t("settings.title")}</h4>
                  <p class="text-sm">{t("main.tabs.empty")}</p>
                  <ul class="list-disc ml-5 text-sm space-y-1">
                    <li>Sample A</li>
                    <li>Sample B</li>
                    <li>Sample C</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
