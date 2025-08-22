// src/components/RightPane.jsx
import { createSignal, Show } from "solid-js";
import { navigate } from "../routing/hashRouter";
import { useApp } from "../context/AppContext.jsx";
import SwitchConnectDialog from "./SwitchConnectDialog.jsx";
import ThemeToggle from "./ui/ThemeToggle.jsx";
import LangSelector from "./ui/LangSelector.jsx";
import RightPaneFooter from "./RightPaneFooter.jsx";

export default function RightPane({ isOpen, onClose }) {
  const app = useApp();
  const { t } = app;
  const [showSwitch, setShowSwitch] = createSignal(false);
  const noopApply = () => { };
  const handlePanelClick = (e) => { if (e.target === e.currentTarget) onClose(); };

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-lg z-30 ${isOpen() ? "right-0" : "right-[-256px]"} transition-all duration-300`}
        onClick={handlePanelClick}
        data-testid="right-pane"
        style="border-left: 1px solid hsl(var(--border));"
      >
        <div class="h-full flex flex-col p-4 space-y-3">
          <nav class="pt-2">
            <ul class="space-y-3">
              <li><ThemeToggle /></li>
              <li><LangSelector /></li>

              <Show when={app.config()?.gear}>
                <li>
                  <div
                    class="px-2 py-0 rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                    role="button" tabIndex={0}
                    onClick={() => setShowSwitch(true)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSwitch(true); } }}
                  >
                    {t("rightPane.switch.open")}
                  </div>
                </li>
              </Show>

              <li>
                <div
                  class="px-2 py-0 rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => { navigate("/docs"); onClose(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/docs"); onClose(); } }}
                  aria-label={t("docs.nav")}
                  title={t("docs.nav")}
                >
                  {t("docs.nav")}
                </div>
              </li>



              <li>
                <div
                  class="px-2 py-0 rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => { navigate("/settings"); onClose(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/settings"); onClose(); } }}
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
        {() => (
          <SwitchConnectDialog
            open={true}
            domain={app.config()?.domain}
            backendLink={app.config()?.backendLink}
            loading={app.loading()}
            error={app.error()}
            onApply={noopApply}
            onReset={app.clearConnectOverride}
            onClose={() => setShowSwitch(false)}
          />
        )}
      </Show>
    </>
  );
}
