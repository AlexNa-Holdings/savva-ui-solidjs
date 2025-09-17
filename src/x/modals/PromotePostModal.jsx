// src/x/modals/PromotePostModal.jsx
import { Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import Tabs from "../ui/Tabs.jsx";
import PromoteAnnounceTab from "../promote/PromoteAnnounceTab.jsx";
import PromoteNftTab from "../promote/PromoteNftTab.jsx";

export default function PromotePostModal(props) {
  const app = useApp();
  const { t } = app;
  const post = () => props.post || null;

  const [tab, setTab] = createSignal("announce");
  const items = () => [
    { id: "announce", label: t("promote.tab.announce") },
    { id: "nft", label: t("promote.tab.nft") },
  ];

  const close = () => { try { props.onClose?.(); } catch {} };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={close}
      size="2xl"
      title={t("promote.title")}
      hint={t("promote.hint")}
      showClose={false}                 // no × button
      minWClass="sm:min-w-[580px]"     // sensible min width on desktop
      noPadding={true}            // we handle padding ourselves
      footer={
        <div class="px-2 py-1 flex items-center justify-end gap-3">
          <button
            class="px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
            onClick={close}
          >
            {t("common.close")}
          </button>
        </div>
      }
    >
      {/* Tabs with no extra gap below header */}
      <div class="px-6 pt-0 pb-0">
        <Tabs items={items()} value={tab()} onChange={setTab} compactWidth={520} />
      </div>

      {/* Tab content flush with tabs */}
      <div class="px-6 pt-0 pb-5 max-h-[70vh] overflow-y-auto">
        <Show when={tab() === "announce"}>
          <PromoteAnnounceTab post={post()} />
        </Show>
        <Show when={tab() === "nft"}>
          <PromoteNftTab post={post()} />
        </Show>
      </div>
    </Modal>
  );
}
