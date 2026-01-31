// src/x/RightPane.jsx
import { createSignal, Show, createMemo } from "solid-js";
import { navigate } from "../routing/smartRouter.js";
import { useApp } from "../context/AppContext.jsx";
import SwitchConnectModal from "./modals/SwitchConnectModal.jsx";
import ThemeToggle from "./ui/ThemeToggle.jsx";
import LangSelector from "./ui/LangSelector.jsx";
import RightPaneFooter from "./RightPaneFooter.jsx";
import { dbg } from "../utils/debug.js";

export default function RightPane({ isOpen, onClose }) {
  const app = useApp();
  const { t } = app;
  const [showSwitch, setShowSwitch] = createSignal(false);

  const handlePanelClick = (e) => { if (e.target === e.currentTarget) onClose(); };

  const domainLangCodes = createMemo(() => app.i18nAvailable?.()?.map((c) => c.toLowerCase()) || []);

  const showLangSelector = createMemo(() => domainLangCodes().length > 1);

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-lg z-40 ${isOpen() ? "right-0" : "right-[-256px]"} transition-all duration-300`}
        onClick={handlePanelClick}
        data-testid="right-pane"
        style="border-left: 1px solid hsl(var(--border));"
      >
        <div class="h-full flex flex-col p-4 space-y-3 overflow-y-auto sv-rightpane__scroll">
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

              {/* Fundraising link */}
              <li>
                <div
                  class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/fundraising");
                    onClose();
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); app.setSavedScrollY(window.scrollY); navigate("/fundraising"); onClose(); } }}
                >
                  {t("rightPane.fundraising")}
                </div>
              </li>

              {/* Sacrifice link */}
              <li>
                <div
                  class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/sac");
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      app.setSavedScrollY(window.scrollY);
                      navigate("/sac");
                      onClose();
                    }
                  }}
                >
                  {t("rightPane.sacrifice")}
                </div>
              </li>

              {/* Buy & Burn link */}
              <li>
                <div
                  class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/buy-burn");
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      app.setSavedScrollY(window.scrollY);
                      navigate("/buy-burn");
                      onClose();
                    }
                  }}
                >
                  {t("rightPane.buyburn")}
                </div>
              </li>

              {/* Content Fund Rounds link */}
              <li>
                <div
                  class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/content-fund-rounds");
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      app.setSavedScrollY(window.scrollY);
                      navigate("/content-fund-rounds");
                      onClose();
                    }
                  }}
                >
                  {t("rightPane.contentFundRounds")}
                </div>
              </li>

              {/* Governance link */}
              <li>
                <div
                  class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/governance");
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      app.setSavedScrollY(window.scrollY);
                      navigate("/governance");
                      onClose();
                    }
                  }}
                >
                  {t("rightPane.governance")}
                </div>
              </li>

              {/* NPO list link */}
              <li>
                <div
                  class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                  role="button" tabIndex={0}
                  onClick={() => {
                    app.setSavedScrollY(window.scrollY);
                    navigate("/npo-list");
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      app.setSavedScrollY(window.scrollY);
                      navigate("/npo-list");
                      onClose();
                    }
                  }}
                >
                  {t("rightPane.npoList")}
                </div>
              </li>

              {/* Export/Import link (authorized users only) */}
              <Show when={app.authorizedUser()}>
                <li>
                  <div
                    class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                    role="button" tabIndex={0}
                    onClick={() => {
                      app.setSavedScrollY(window.scrollY);
                      navigate("/export-import");
                      onClose();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        app.setSavedScrollY(window.scrollY);
                        navigate("/export-import");
                        onClose();
                      }
                    }}
                  >
                    {t("rightPane.exportImport")}
                  </div>
                </li>
              </Show>

              {/* Exchange link (devMode only) */}
              <Show when={app.config()?.devMode}>
                <li>
                  <div
                    class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                    role="button" tabIndex={0}
                    onClick={() => {
                      app.setSavedScrollY(window.scrollY);
                      navigate("/exchange");
                      onClose();
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); app.setSavedScrollY(window.scrollY); navigate("/exchange"); onClose(); } }}
                  >
                    {t("rightPane.exchange")}
                  </div>
                </li>
              </Show>

              {/* Admin-only links */}
              <Show when={app.authorizedUser()?.isAdmin}>
                <li>
                  <div
                    class="px-2  rounded cursor-pointer hover:bg-[hsl(var(--accent)))]"
                    role="button" tabIndex={0}
                    onClick={() => {
                      app.setSavedScrollY(window.scrollY);
                      navigate("/admin");
                      onClose();
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); app.setSavedScrollY(window.scrollY); navigate("/admin"); onClose(); } }}
                  >
                    {t("rightPane.admin")}
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
        <SwitchConnectModal
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
