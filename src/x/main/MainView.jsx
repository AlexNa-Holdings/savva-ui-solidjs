// src/x/main/MainView.jsx
import { createResource, Show, createMemo, createSignal, createEffect, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Container from "../layout/Container.jsx";
import ToTopButton from "../ui/ToTopButton.jsx";
import NewContentBanner from "./NewContentBanner.jsx";
import { useHashRouter } from "../../routing/hashRouter.js";
import { loadAssetResource } from "../../utils/assetLoader.js";
import { getTabComponent } from "../tabs/index.js";
import RightRailLayout from "../tabs/RightRailLayout.jsx";
import TabPanelScaffold from "../tabs/TabPanelScaffold.jsx";
import { tabIconFor } from "../ui/icons/TabIcons.jsx";
import { restoreWindowScrollY } from "../../utils/scrollRestore.js";

const slug = (s) => String(s || "").trim().toLowerCase();

function getActiveTabKeyFromRoute(path) {
  const r = String(path || "");
  if (r.startsWith("/t/")) {
    const key = r.slice(3).split(/[?#]/)[0];
    return key;
  }
  const s = r.startsWith("/") ? r.slice(1) : r;
  return s.split(/[?#]/, 1)[0] || "";
}

export default function MainView(props) {
  const app = useApp();
  const { t, domainAssetsConfig } = app;
  const { route } = useHashRouter();

  const isActive = () => props?.isActivated ?? true;

  // Snapshot last main route while active, so tabs don't flip on /post/... etc.
  const [mainRouteSnapshot, setMainRouteSnapshot] = createSignal("/");
  createEffect(() => { if (isActive()) setMainRouteSnapshot(route()); });

  // 🔁 Late scroll restoration after the feed has height again.
  let cancelRestore = null;
  createEffect(() => {
    if (!isActive()) return;
    const y = app.savedScrollY?.() || 0;
    if (y > 0) {
      if (cancelRestore) cancelRestore();
      cancelRestore = restoreWindowScrollY(y, { maxAttempts: 50, interval: 60 });
      // Prevent repeated jumps on subsequent reactive cycles
      app.setSavedScrollY(0);
    }
  });
  onCleanup(() => { if (cancelRestore) cancelRestore(); });

  const tabsPath = createMemo(() => domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml");

  const [tabsRaw] = createResource(
    () => tabsPath(),
    async (relPath) => {
      if (!relPath) return [];
      const data = (await loadAssetResource(app, relPath, { type: "yaml" })) || {};
      const list = Array.isArray(data) ? data : Array.isArray(data.tabs) ? data.tabs : [];
      return list.map((x, i) => ({
        id: x?.id ?? x?.type ?? `tab_${i}`,
        type: x?.type ?? x?.id ?? `tab_${i}`,
        _raw: x,
      }));
    }
  );

  const tabsRoute = createMemo(() => (isActive() ? route() : mainRouteSnapshot()));

  const activeTab = createMemo(() => {
    const list = tabsRaw();
    if (!list || list.length === 0) return null;
    const key = getActiveTabKeyFromRoute(tabsRoute());
    if (!key && tabsRoute() === "/") return list[0];
    return list.find(t => slug(t.id) === key || slug(t.type) === key) || list[0];
  });

  return (
    <Container>
      <ToTopButton />
      <NewContentBanner />
      <div class="w-full">
        <Show when={activeTab()} keyed>
          {(tab) => {
            const Comp = getTabComponent(tab.type);
            const title = t(`tabs.title.${slug(tab.type)}`) || t("main.tabs.untitled");
            const rightPanelConfig = tab._raw?.right_panel;
            const isRailVisible = rightPanelConfig?.available;
            const icon = tabIconFor(tab.type);

            return (
              <div class="tabs_panel">
                <RightRailLayout rightPanelConfig={rightPanelConfig}>
                  <Show when={Comp} fallback={<TabPanelScaffold title={title} />}>
                    <Comp
                      title={title}
                      icon={icon}
                      tab={tab}
                      isRailVisible={isRailVisible}
                      isActivated={isActive()}
                    />
                  </Show>
                </RightRailLayout>
              </div>
            );
          }}
        </Show>
      </div>
    </Container>
  );
}
