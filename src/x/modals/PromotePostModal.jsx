// src/x/modals/PromotePostModal.jsx
import { Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import ModalBackdrop from "./ModalBackdrop.jsx";
import ModalAutoCloser from "./ModalAutoCloser.jsx";
import Tabs from "../ui/Tabs.jsx";
import PromoteAnnounceTab from "../promote/PromoteAnnounceTab.jsx";
import PromoteNftTab from "../promote/PromoteNftTab.jsx";

export default function PromotePostModal(props) {
  const app = useApp();
  const { t } = app;
  const open = () => !!props.isOpen;
  const post = () => props.post || null;

  const [tab, setTab] = createSignal("announce");
  const items = () => [
    { id: "announce", label: t("promote.tab.announce") },
    { id: "nft", label: t("promote.tab.nft") },
  ];

  const close = () => {
    try { props.onClose?.(); } catch {}
  };

  return (
    <Show when={open()}>
      <Portal>
        {/* Backdrop at z-60 */}
        <ModalBackdrop onClose={close} />

        {/* Dialog at z-70 */}
        <div class="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <ModalAutoCloser onClose={close} />
          <div class="w-full max-w-[760px] rounded-2xl bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-2xl border border-[hsl(var(--border))]">
            {/* Header */}
            <div class="px-6 pt-5 pb-3 border-b border-[hsl(var(--border))]">
              <h3 class="text-lg font-semibold">{t("promote.title")}</h3>
              <p class="mt-1 text-sm opacity-80">{t("promote.hint")}</p>
            </div>

            {/* Tabs (flush with content, no bottom gap) */}
            <div class="px-6 pt-2 pb-0">
              <Tabs items={items()} value={tab()} onChange={setTab} compactWidth={520} />
            </div>

            {/* Body (no extra padding-top to avoid a visible gap under tabs) */}
            <div class="px-6 pt-0 pb-5 max-h-[70vh] overflow-y-auto">
              <Show when={tab() === "announce"}>
                <PromoteAnnounceTab post={post()} />
              </Show>
              <Show when={tab() === "nft"}>
                <PromoteNftTab post={post()} />
              </Show>
            </div>

            {/* Footer */}
            <div class="px-6 py-4 border-t border-[hsl(var(--border))] flex items-center justify-end gap-3">
              <button
                class="px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
                onClick={close}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
