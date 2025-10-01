// src/x/modals/PromotePostModal.jsx
import { Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import Tabs from "../ui/Tabs.jsx";
import PromoteAnnounceTab from "../promote/PromoteAnnounceTab.jsx";
import PromoteNftTab from "../promote/PromoteNftTab.jsx";
import AnnounceIcon from "../ui/icons/AnnounceIcon.jsx";
import NftBadge from "../ui/icons/NftBadge.jsx";

export default function PromotePostModal(props) {
  const app = useApp();
  const { t } = app;
  const post = () => props.post || null;

  const [tab, setTab] = createSignal("announce");
  const items = () => [
    { id: "announce", label: t("promote.tab.announce"), icon: <AnnounceIcon class="h-4 w-4" /> },
    { id: "nft", label: t("promote.tab.nft"), icon: <NftBadge class="h-4 w-4" /> },
  ];

  const close = () => { try { props.onClose?.(); } catch {} };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={close}
      size="4xl-fixed"
      title={t("promote.title")}
      hint={t("promote.hint")}
      showClose={false}                 // no × button
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
      <div class="w-full px-6 pt-0 pb-5 flex-1 overflow-y-auto">
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
