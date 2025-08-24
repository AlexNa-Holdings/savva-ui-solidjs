// src/components/main/MainView.jsx
import { createMemo, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import TabsBar from "./TabsBar";
import Container from "../layout/Container";
import ToTopButton from "../ui/ToTopButton";
import { dbg } from "../../utils/debug.js";

export default function MainView() {
  const { t, selectedDomain, domainAssetsConfig, domainAssetsSource, loading } = useApp();

  const domainName = createMemo(() => {
    const d = selectedDomain?.();
    return !d ? "" : typeof d === "string" ? d : d.name || "";
  });

  const title = createMemo(() => t("main.title", { domain: domainName() || "SAVVA" }));

  const revision = createMemo(() => {
    if (loading()) return null;

    const source = domainAssetsSource?.();
    const cfg = domainAssetsConfig?.();
    const cid = cfg?.assets_cid || cfg?.cid || "";
    const tabs = cfg?.modules?.tabs || "";
    
    const key = `${domainName()}|${source}|${cid}|${tabs}`;
    // --- DEBUG: Log the revision key using dbg ---
    dbg.log('MainView', `Revision key updated to: ${key}`);
    return key;
  });

  return (
    <Container>
      <ToTopButton />
      <div class="w-full">
        <Show when={revision()} keyed>
          {() => <TabsBar />}
        </Show>
      </div>
    </Container>
  );
}