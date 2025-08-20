// src/components/tabs/NILRightPanel.jsx
import { useApp } from "../../context/AppContext.jsx";

const HEADER_H = 48; // keep synced with header height

export default function NILRightPanel() {
  const { t } = useApp();

  return (
    <aside
      class="hidden lg:block"
      style={{ position: "sticky", top: `${HEADER_H}px` }}
    >
      <div
        class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]"
        style={{
          "max-height": `calc(100vh - ${HEADER_H}px)`,
          overflow: "hidden",
        }}
      >
        <div
          class="p-3 space-y-3 overflow-auto"
          style={{ "max-height": `calc(100vh - ${HEADER_H}px - 1px - 1px)` }}
        >
          <h4 class="font-semibold">Right Panel</h4>
          <p class="text-sm">
            {t("main.tabs.empty")} — this content is intentionally long to
            demonstrate internal scrolling:
          </p>

          {/* demo long content */}
          <ul class="list-disc ml-5 text-sm space-y-1">
            <li>Example item A</li>
            <li>Example item B</li>
            <li>Example item C</li>
          </ul>
          <div class="text-sm leading-snug space-y-2">
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis
              congue, magna non gravida finibus, felis nisl finibus nunc,
              laoreet imperdiet arcu erat in felis.
            </p>
            <p>
              Sed vitae lectus nec nisl elementum bibendum. Phasellus vel orci
              vitae lectus dapibus rhoncus. Suspendisse vehicula arcu a sem
              pharetra, at pulvinar ex gravida.
            </p>
            <p>
              Maecenas at urna sed turpis pretium volutpat. Aliquam vulputate
              porttitor metus, ut interdum ante semper quis.
            </p>
            <p>
              Praesent fermentum, justo eu volutpat ultricies, eros ante
              facilisis risus, eget dictum quam nibh a neque. Integer
              ullamcorper, ipsum non consequat sollicitudin, arcu massa
              elementum est, vitae gravida nibh nibh vel eros.
            </p>
            <p>
              Ut at vestibulum nibh. Vivamus euismod, justo vitae dictum
              posuere, mi quam viverra quam, et dictum ex tellus non augue.
            </p>
            <p>
              Integer dignissim lacus sed nibh posuere, vitae luctus lectus
              rhoncus. Vestibulum ante ipsum primis in faucibus orci luctus et
              ultrices posuere cubilia curae; Quisque ut odio non velit maximus
              mollis.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
