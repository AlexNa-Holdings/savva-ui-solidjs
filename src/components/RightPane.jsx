// src/components/RightPane.jsx
import { createEffect, createSignal, Show } from "solid-js";
import { navigate } from "../routing/hashRouter";
import { useApp } from "../context/AppContext.jsx";
import SwitchConnectDialog from "./SwitchConnectDialog.jsx";
import ThemeToggle from "./ui/ThemeToggle.jsx";
import LangSelector from "./ui/LangSelector.jsx";

export default function RightPane({ isOpen, onClose }) {
  const app = useApp();
  const { t } = app;

  const handlePanelClick = (e) => { if (e.target === e.currentTarget) onClose(); };
  const [showSwitch, setShowSwitch] = createSignal(false);
  const noopApply = () => {};

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-white dark:bg-gray-800 shadow-lg z-30 ${isOpen() ? "right-0" : "right-[-256px]"} transition-all duration-300`}
        onClick={handlePanelClick}
        data-testid="right-pane"
      >
        <div class="p-4 space-y-3">
          {/* Close */}
          <button
            class="p-0 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={onClose}
            aria-label={t("rightPane.close")}
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Theme + Language */}
          <nav class="pt-2">
            <ul class="space-y-3">
              <li><ThemeToggle /></li>
              <li><LangSelector /></li>

              {/* Switch backend / domain (conditional) */}
              <Show when={app.config()?.gear}>
                <li>
                  <div
                    class="px-2 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowSwitch(true)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSwitch(true); } }}
                  >
                    {t("rightPane.switch.open")}
                  </div>
                </li>

                <li>
                  <div
                    class="px-2 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                    role="button"
                    tabIndex={0}
                    onClick={() => { navigate("/settings"); onClose(); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/settings"); onClose(); } }}
                  >
                    {t("rightPane.settings")}
                  </div>
                </li>
              </Show>
            </ul>
          </nav>
        </div>
      </div>

      {isOpen() && <div class="fixed inset-0 bg-black opacity-20 z-20" style={{ "background-color": "rgba(0, 0, 0, 0.2)" }} data-testid="overlay" onClick={onClose} />}

      {/* Re-seed from AppContext on open */}
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
