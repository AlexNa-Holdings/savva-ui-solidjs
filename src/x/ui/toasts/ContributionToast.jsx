// src/x/ui/toasts/ContributionToast.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import UserCard from "../../ui/UserCard.jsx";
import TokenValue from "../../ui/TokenValue.jsx";
import { navigate } from "../../../routing/hashRouter.js";

// This helper now correctly handles the multi-language title object from the alert.
function getLocalizedTitle(multiString, lang) {
  if (!multiString || typeof multiString !== 'object') return "";
  return multiString[lang] || multiString.en || Object.values(multiString)[0] || "";
}

export default function ContributionToast(props) {
  const app = useApp();
  const { t, lang } = app;
  const data = () => props.data || {};

  const contributor = () => data().contributor || {};
  const postTitle = createMemo(() => getLocalizedTitle(data().title, lang()));
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
    </div>
  );
}

