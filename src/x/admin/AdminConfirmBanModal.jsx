// src/x/admin/AdminConfirmBanModal.jsx
import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ContentCard from "../post/ContentCard.jsx";
import UserCard from "../ui/UserCard.jsx";

export default function AdminConfirmBanModal(props) {
  // props: { open, action: "ban-post"|"ban-user", savva_cid, author, post, onConfirm(comment), onClose() }
  const app = useApp();
  const { t } = app;
  const [comment, setComment] = createSignal("");

  const close = () => {
    setComment("");
    props.onClose?.();
  };

  const confirm = () => {
    const c = String(comment() || "");
    setComment("");
    props.onConfirm?.(c);
  };

  const handleKey = (e) => {
    if (e.key === "Escape") close();
  };

  onMount(() => document.addEventListener("keydown", handleKey));
  onCleanup(() => document.removeEventListener("keydown", handleKey));

  const authorObj = () => props.post?.author || (props.author ? { address: props.author } : null);

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-[1000]">
          <ModalBackdrop onClick={close} />
          <div role="dialog" aria-modal="true" class="fixed inset-0 flex items-center justify-center p-4">
            <div class="w-full max-w-2xl rounded-2xl shadow-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
              <ModalAutoCloser onClose={close} />

              <div class="px-5 py-4 border-b border-[hsl(var(--border))]">
                <h2 class="text-lg font-semibold">
                  {props.action === "ban-post" ? t("admin.banPostTitle") : t("admin.banUserTitle")}
                </h2>
              </div>

              <div class="px-5 py-4 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
                <Show when={props.action === "ban-post"}>
                  <p class="text-sm opacity-80">{t("admin.banPostDesc")}</p>
                </Show>
                <Show when={props.action === "ban-user"}>
                  <p class="text-sm opacity-80">{t("admin.banUserDesc")}</p>
                </Show>

                <div class="space-y-4">
                  <div>
                    <div class="text-xs font-medium opacity-70 mb-2">{t("admin.previewUser")}</div>
                    {/* Full UserCard (interactive) */}
                    <div class="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
                      <UserCard author={authorObj()} />
                    </div>
                  </div>

                  <Show when={props.post}>
                    <div>
                      <div class="text-xs font-medium opacity-70 mb-2">{t("admin.previewPost")}</div>
                      <div class="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
                        <ContentCard item={props.post} mode="list" compact={true} />
                      </div>
                    </div>
                  </Show>
                </div>

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
                  class="px-4 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:opacity-90"
                  onClick={close}
                >
                  {t("admin.cancel")}
                </button>
                <button
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
    </Show>
  );
}
