// src/components/RightPane.jsx
import { createSignal, Show, createMemo, createEffect } from "solid-js";
import { navigate } from "../routing/hashRouter";
import { useApp } from "../context/AppContext.jsx";
import SwitchConnectDialog from "./SwitchConnectDialog.jsx";
import ThemeToggle from "./ui/ThemeToggle.jsx";
import LangSelector from "./ui/LangSelector.jsx";
import RightPaneFooter from "./RightPaneFooter.jsx";
import { dbg } from "../utils/debug.js";

export default function RightPane({ isOpen, onClose }) {
  const app = useApp();
  const { t } = app;
  const [showSwitch, setShowSwitch] = createSignal(false);

  const handlePanelClick = (e) => { if (e.target === e.currentTarget) onClose(); };

  const domainLangCodes = createMemo(() => {
    const config = app.domainAssetsConfig?.();
    if (!config || !Array.isArray(config.locales)) {
      dbg.log("RightPane", "domainLangCodes is EMPTY because config is missing or invalid.");
      return [];
    }
    const codes = config.locales.map((l) => l.code).filter(Boolean);
    dbg.log("RightPane", "domainLangCodes calculated:", codes);
    return codes;
  });

  const showLangSelector = createMemo(() => domainLangCodes().length > 1);

  createEffect(() => {
    const availableCodes = domainLangCodes();
    const currentLang = app.lang?.();
    dbg.log("RightPaneEffect", "Running check...", { currentLang, availableCodes: [...availableCodes] });

    if (availableCodes.length === 0) {
      dbg.log("RightPaneEffect", "-> SKIPPING: No available codes yet.");
      return;
    }

    if (!availableCodes.includes(currentLang)) {
      dbg.warn("RightPaneEffect", `-> MISMATCH! Lang '${currentLang}' is not in [${availableCodes.join(", ")}]. Resetting to '${availableCodes[0]}'.`);
      app.setLang?.(availableCodes[0]);
    } else {
      dbg.log("RightPaneEffect", `-> OK: Lang '${currentLang}' is valid.`);
    }
  });

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-lg z-40 ${isOpen() ? "right-0" : "right-[-256px]"} transition-all duration-300`}
        onClick={handlePanelClick}
        data-testid="right-pane"
        style="border-left: 1px solid hsl(var(--border));"
      >
        <div class="h-full flex flex-col p-4 space-y-3">
          <nav class="pt-2">
            <ul class="space-y-3">
              <li><ThemeToggle /></li>

              <Show when={showLangSelector()}>
                <li><LangSelector codes={domainLangCodes()} /></li>
              </Show>

              {/* Gear settings link */}
              <Show when={app.config()?.gear}>
                <li>
                  <div
                    class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                    role="button" tabIndex={0}
                    onClick={() => setShowSwitch(true)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSwitch(true); } }}
                  >
                    {t("rightPane.switch.open")}
                  </div>
                </li>
              </Show>

              {/* Documentation link */}
              <li>
                <div
                  class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/docs"); 
                    onClose(); 
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); app.setSavedScrollY(window.scrollY); navigate("/docs"); onClose(); } }}
                  aria-label={t("docs.nav")}
                  title={t("docs.nav")}
                >
                  {t("docs.nav")}
                </div>
              </li>

              {/* Settings link */}
              <li>
                <div
                  class="px-2 rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/settings"); 
                    onClose(); 
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); app.setSavedScrollY(window.scrollY); navigate("/settings"); onClose(); } }}
                >
                  {t("rightPane.settings")}
                </div>
              </li>
            </ul>
          </nav>
          <RightPaneFooter />
        </div>
      </div>

      {isOpen() && (
        <div
          class="fixed inset-0 z-20"
          style={{ "background-color": "rgba(0,0,0,0.2)" }}
          data-testid="overlay"
          onClick={onClose}
        />
      )}

      <Show when={showSwitch()} keyed>
        <SwitchConnectDialog
          open={true}
          domain={app.config()?.domain}
          backendLink={app.config()?.backendLink}
          loading={app.loading()}
          error={app.error()}
          onApply={() => { }}
          onReset={app.clearConnectOverride}
          onClose={() => setShowSwitch(false)}
        />
      </Show>
    </>
  );
}