// src/components/main/MainView.jsx
import { createMemo, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import TabsBar from "./TabsBar";
import Container from "../layout/Container";

export default function MainView() {
  const { t, selectedDomain, domainAssetsConfig } = useApp();

  // reactive domain name
  const domainName = createMemo(() => {
    const d = selectedDomain?.();
    return !d ? "" : typeof d === "string" ? d : d.name || "";
  });

  // localized title (not rendered here but kept ready)
  const title = createMemo(() => t("main.title", { domain: domainName() || "SAVVA" }));

  // change key when domain or assets pack changes to remount children
  const revision = createMemo(() => {
    const cfg = domainAssetsConfig?.();
    const cid = cfg?.assets_cid || cfg?.cid || "";
    const tabs = cfg?.modules?.tabs || "";
    return `${domainName()}|${cid}|${tabs}`;
  });

  return (
    <Container>
      <div class="w-full">
        <Show when={revision()} keyed>
          {() => <TabsBar />}
        </Show>
      </div>
    </Container>
  );
}
