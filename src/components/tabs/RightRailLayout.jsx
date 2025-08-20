// src/components/tabs/RightRailLayout.jsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

const HEADER_H = 48;          // <header> h-12
const MAIN_PADDING_TOP = 16;  // .tabs_panel padding-top: 1rem
const BASE_TOP = HEADER_H + MAIN_PADDING_TOP;
const PANEL_BOTTOM_SPACING = 16; // (1rem) Tweak this value to account for bottom margin/padding.

export default function RightRailLayout(props) {
    const { t } = useApp();
    const Panel = props.PanelComponent;

    let panelRef;
    const [topPx, setTopPx] = createSignal(BASE_TOP);

    function recompute() {
        const vh = window.innerHeight || 0;
        
        // Use offsetHeight for visual dimensions and add our spacing constant.
        const panelH = (panelRef?.offsetHeight || 0) + PANEL_BOTTOM_SPACING;

        const availableH = vh - BASE_TOP;
        let top = BASE_TOP;

        if (panelH > availableH) {
            top = vh - panelH;
        }

        setTopPx(top);
    }

    onMount(() => {
        requestAnimationFrame(recompute);

        const onResize = () => recompute();
        window.addEventListener("resize", onResize, { passive: true });

        const ro = new ResizeObserver(recompute);
        if (panelRef) ro.observe(panelRef);

        onCleanup(() => {
            window.removeEventListener("resize", onResize);
            ro.disconnect();
        });
    });

    return (
        <section class="w-full">
            <div
                class="
                    grid gap-4
                    grid-cols-1
                    md:grid-cols-[minmax(0,1fr)_320px]
                    items-start
                "
                style={{ "min-height": `calc(100vh - ${HEADER_H}px)` }}
            >
                {/* main column */}
                <div>{props.children}</div>

                {/* right rail */}
                <aside
                    class="hidden md:block sticky"
                    style={{ top: `${topPx()}px` }}
                >
                    <div
                        ref={panelRef}
                        class="
                            rounded-lg border border-[hsl(var(--border))]
                            bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]
                            flex flex-col
                        "
                    >
                        <div class="p-3 space-y-3">
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
                                        <li>Sample D</li>
                                        <li>Sample E</li>
                                        <li>Sample F</li>
                                        <li>Sample G</li>
                                        <li>Sample H</li>
                                        <li>Sample I</li>
                                        <li>Sample J</li>
                                        <li>Sample A</li>
                                        <li>Sample B</li>
                                        <li>Sample C</li>
                                        <li>Sample D</li>
                                        <li>Sample E</li>
                                        <li>Sample F</li>
                                        <li>Sample G</li>
                                        <li>Sample H</li>
                                        <li>Sample I</li>
                                        <li>Sample J</li>
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