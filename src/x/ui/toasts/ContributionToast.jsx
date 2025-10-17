// src/x/ui/toasts/ContributionToast.jsx
import { createMemo, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import UserCard from "../../ui/UserCard.jsx";
import TokenValue from "../../ui/TokenValue.jsx";
import { navigate } from "../../../routing/smartRouter.js";
import {
  selectPostToastTitle,
  selectPostToastPreview,
  isPostEncryptedAlert,
} from "./postToastUtils.js";

export default function ContributionToast(props) {
  const app = useApp();
  const { t, lang } = app;
  const data = () => props.data || {};

  const contributor = () => data().contributor || {};
  const postTitle = createMemo(() => selectPostToastTitle(data(), lang(), t));
  const postPreview = createMemo(() => selectPostToastPreview(data(), lang(), t));
  const isEncrypted = createMemo(() => isPostEncryptedAlert(data()));
  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;

  const handlePostClick = (e) => {
    e.preventDefault();
    const cid = data().content_id;
    if (cid) {
      navigate(`/post/${cid}`);
      app.dismissToast?.(props.toast.id);
    }
  };

  return (
    <div class="p-3 space-y-2">
      <div class="flex items-center gap-2">
        <div class="w-2/3">
          <UserCard author={contributor()} compact={true} />
        </div>
        <div class="w-1/3 text-right">
          <TokenValue amount={data().contributed} tokenAddress={savvaTokenAddress()} />
        </div>
      </div>
      <div class="text-sm">
        <span class="text-[hsl(var(--muted-foreground))]">
          {t("alerts.fund_contributed.actionText", { contributorName: contributor().name || t("default.user") })}
        </span>
        <a
          href={`#/post/${data().content_id}`}
          onClick={handlePostClick}
          class="font-semibold text-[hsl(var(--foreground))] hover:underline ml-1"
        >
          "{postTitle()}"
        </a>
      </div>
      <Show
        when={postPreview()}
      >
        <div
          class="text-xs text-[hsl(var(--muted-foreground))]"
          classList={{ "italic": isEncrypted() }}
        >
          {postPreview()}
        </div>
      </Show>
    </div>
  );
}
