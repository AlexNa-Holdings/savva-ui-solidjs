// src/x/admin/AdminConfirmBanModal.jsx
import { createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ContentCard from "../post/ContentCard.jsx";
import UserCard from "../ui/UserCard.jsx";

export default function AdminConfirmBanModal(props) {
  // props: { open, action: "ban-post"|"ban-user", savva_cid, author, user, post, onConfirm(comment), onClose() }
  const app = useApp();
  const { t } = app;
  const [comment, setComment] = createSignal("");

  const isBanPost = () => props.action === "ban-post";
  const isBanUser = () => props.action === "ban-user";

  const close = () => {
    setComment("");
    props.onClose?.();
  };

  const confirm = () => {
    props.onConfirm?.(comment());
  };

  const authorObj = () =>
    props.post?.author ||
    (props.author ? { address: props.author } : null);

  return (
      <Portal>
        <div class="fixed inset-0 z-60 flex items-center justify-center">
          <ModalBackdrop onClick={close} />
          <div role="dialog" aria-modal="true" class="fixed inset-0 flex items-center justify-center p-4">
            <div class="w-full z-70 max-w-2xl rounded-2xl shadow-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
              <ModalAutoCloser onClose={close} />

              <div class="px-5 py-4 border-b border-[hsl(var(--border))]">
                <h2 class="text-lg font-semibold">
                  {isBanPost() ? t("admin.banPostTitle") : t("admin.banUserTitle")}
                </h2>
                <p class="text-sm opacity-80 mt-1">
                  {isBanPost() ? t("admin.banPostDesc") : t("admin.banUserDesc")}
                </p>
              </div>

              <div class="px-5 py-4 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {/* Always show user */}
                <div>
                  <div class="text-xs font-medium opacity-70 mb-2">{t("admin.previewUser")}</div>
                  <div class="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
                    <UserCard author={authorObj()} />
                  </div>
                </div>

                {/* Only show post preview for ban-post */}
                <Show when={isBanPost() && props.post}>
                  <div>
                    <div class="text-xs font-medium opacity-70 mb-2">{t("admin.previewPost")}</div>
                    <div class="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
                      <ContentCard item={props.post} noContextMenu={true} mode="list" compact={true} />
                    </div>
                  </div>
                </Show>

                <div>
                  <label class="block text-sm mb-1 opacity-80">{t("admin.commentLabel")}</label>
                  <textarea
                    class="w-full min-h-[90px] rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 outline-none"
                    placeholder={t("admin.reasonPlaceholder")}
                    value={comment()}
                    onInput={(e) => setComment(e.currentTarget.value)}
                  />
                </div>

                <p class="text-xs opacity-60">{t("admin.banWarning")}</p>
              </div>

              <div class="px-5 py-4 border-t border-[hsl(var(--border))] flex items-center justify-end gap-3">
                <button
                  type="button"
                  class="px-4 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:opacity-90"
                  onClick={close}
                >
                  {t("admin.cancel")}
                </button>
                <button
                  type="button"
                  class="px-4 py-2 rounded-xl bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90"
                  onClick={confirm}
                >
                  {t("admin.confirmBan")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
  );
}
