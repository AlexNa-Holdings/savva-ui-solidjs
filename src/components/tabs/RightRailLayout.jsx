// src/components/tabs/RightRailLayout.jsx
import { Show } from "solid-js";
import RightRail from "../layout/RightRail.jsx";

const HEADER_H = 48;

export default function RightRailLayout(props) {
  return (
    <section
      class="w-full"
      style={{ "min-height": `calc(100vh - ${HEADER_H}px)` }}
    >
      <Show
        when={props.rightPanelConfig?.available}
        fallback={
          // When the right panel is unavailable, render content in a single column.
          <div>{props.children}</div>
        }
      >
        {/* When the right panel is available, render the two-column grid. */}
        <div class="grid gap-4 grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div>{props.children}</div>
          <aside class="hidden md:block sticky top-16">
            <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
              <RightRail config={props.rightPanelConfig} />
            </div>
          </aside>
        </div>
      </Show>
    </section>
  );
}