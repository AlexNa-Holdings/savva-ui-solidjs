// src/components/main/MainView.jsx
import { createMemo, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import TabsBar from "./TabsBar";

export default function MainView() {
  const { t, selectedDomain, domainAssetsConfig } = useApp();

  // reactive domain name
  const domainName = createMemo(() => {
    const d = selectedDomain?.();
    return !d ? "" : typeof d === "string" ? d : d.name || "";
  });

  // keep a localized title ready (even if not shown yet)
  const title = createMemo(() => t("main.title", { domain: domainName() || "SAVVA" }));

  // revision flips when domain or asset pack (prod/test) changes
  const revision = createMemo(() => {
    const cfg = domainAssetsConfig?.();
    const cid = cfg?.assets_cid || cfg?.cid || "";
    const tabs = cfg?.modules?.tabs || "";
    return `${domainName()}|${cid}|${tabs}`;
  });

  return (
    <div class="w-full">
      {/* Remount children when revision changes so everything re-reads configs */}
      <Show when={revision()} keyed>
        {() => <TabsBar />}
      </Show>
    </div>
  );
}
