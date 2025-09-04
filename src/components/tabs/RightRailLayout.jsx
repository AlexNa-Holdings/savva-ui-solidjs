// src/components/tabs/RightRailLayout.jsx
import { Show } from "solid-js";
import RightRail from "../layout/RightRail.jsx";
import StickyClamp from "../layout/StickyClamp.jsx";

const HEADER_H = 48;       // app header height
const STICKY_OFFSET = 64;  // breathing room under header

export default function RightRailLayout(props) {
  return (
    <section
      class="w-full"
      style={{ "min-height": `calc(100vh - ${HEADER_H}px)` }}
    >
      <Show
        when={props.rightPanelConfig?.available}
        fallback={<div>{props.children}</div>}
      >
        <div class="grid gap-4 grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div>{props.children}</div>

          {/* Desktop right rail with smart sticky/clamp behavior */}
          <StickyClamp class="hidden md:block" offsetTop={STICKY_OFFSET}>
            <div class="space-y-4">
              <RightRail config={props.rightPanelConfig} />
            </div>
          </StickyClamp>
        </div>
      </Show>
    </section>
  );
}
