// src/x/main/MainView.jsx
import { createResource, Show, createMemo } from "solid-js";
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

const slug = (s) => String(s || "").trim().toLowerCase();

function getActiveTabKeyFromRoute(path) {
  const r = String(path || "");
  if (r.startsWith("/t/")) {
    const key = r.slice(3).split(/[?#]/)[0];
    return key;
  }
  // Fallback for paths without /t/ prefix like /new
  const s = r.startsWith("/") ? r.slice(1) : r;
  return s.split(/[?#]/, 1)[0] || "";
}

export default function MainView() {
  const app = useApp();
  const { t, domainAssetsConfig } = app;
  const { route } = useHashRouter();

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

  const activeTab = createMemo(() => {
    const list = tabsRaw();
    if (!list || list.length === 0) return null;
    const key = getActiveTabKeyFromRoute(route());
    if (!key && route() === "/") return list[0];
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
                      isActivated={true} // Main view tabs are always considered active
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