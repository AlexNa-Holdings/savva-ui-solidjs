// src/components/RightPane.jsx
import { createEffect, createSignal, Show } from "solid-js";
import { useTheme } from "../hooks/useTheme";
import { LANG_INFO } from "../i18n/useI18n";
import { navigate } from "../routing/hashRouter";
import { useApp } from "../context/AppContext.jsx";
import SwitchConnectDialog from "./SwitchConnectDialog.jsx";

export default function RightPane({ isOpen, onClose }) {
  const [theme, toggleTheme] = useTheme();
  const app = useApp();
  const { t } = app;

  createEffect(() => {
    console.log("RightPane: isOpen changed to:", isOpen());
  });

  const handlePanelClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const [showSwitch, setShowSwitch] = createSignal(false);

  // Parent no longer writes config; dialog does it and then calls onClose
  const noopApply = () => {};

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-white dark:bg-gray-800 shadow-lg z-30 ${
          isOpen() ? "right-0" : "right-[-256px]"
        } transition-all duration-300`}
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

          {/* Menu list (includes Theme + Language as items) */}
          <nav class="pt-2">
            <ul class="space-y-1">
              {/* Theme item */}
              <li>
                <div
                  class="px-2 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100 flex items-center justify-between"
                  role="switch"
                  aria-checked={theme() === "dark"}
                  tabIndex={0}
                  onClick={() => { toggleTheme(); console.log("Theme toggled:", theme()); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleTheme();
                    }
                  }}
                >
                  <span>{theme() === "dark" ? t("ui.mode.dark") : t("ui.mode.light")}</span>
                  <span class="ml-2">{theme() === "dark" ? "🌙" : "☀️"}</span>
                </div>
              </li>

              {/* Language item (label left, fixed-width select right) */}
              <li>
                <div
                  class="px-2 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                >
                  <span>{t("rightPane.language")}</span>
                  <select
                    id="rp-lang"
                    class="ml-2 px-2 py-1 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 w-28 shrink-0"
                    aria-label={t("rightPane.language")}
                    value={app.lang()}
                    onInput={(e) => app.setLang(e.currentTarget.value)}
                  >
                    {app.i18nAvailable.map((code) => {
                      const info = LANG_INFO[code] || { code: code.toLowerCase(), name: code };
                      return (
                        <option value={code}>
                          {info.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </li>

              {/* Switch backend / domain (conditional) */}
              <Show when={app.config()?.gear}>
                <li>
                  <div
                    class="px-2 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowSwitch(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setShowSwitch(true);
                      }
                    }}
                  >
                    {t("rightPane.switch.open")}
                  </div>
                </li>

                {/* Settings */}
                <li>
                  <div
                    class="px-2 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-gray-100"
                    role="button"
                    tabIndex={0}
                    onClick={() => { navigate("/settings"); onClose(); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate("/settings"); onClose();
                      }
                    }}
                  >
                    {t("rightPane.settings")}
                  </div>
                </li>
              </Show>
            </ul>
          </nav>
        </div>
      </div>

      {isOpen() && (
        <div
          class="fixed inset-0 bg-black opacity-20 z-20"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }}
          data-testid="overlay"
          onClick={onClose}
        />
      )}

      {/* Mount/unmount the dialog so it always re-seeds from AppContext */}
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
