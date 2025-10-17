// src/x/ui/toasts/FundraiserContributionToast.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import UserCard from "../../ui/UserCard.jsx";
import TokenValue from "../../ui/TokenValue.jsx";
import { navigate } from "../../../routing/smartRouter.js";

export default function FundraiserContributionToast(props) {
  const app = useApp();
  const { t } = app;
  const data = () => props.data || {};

  const contributor = () => data().contributor || {};
  const creator = () => data().creator || {};
  const campaignId = () => data().id;
  
  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;

  const handleCampaignClick = (e) => {
    e.preventDefault();
    const id = campaignId();
    if (id) {
      navigate(`/fr/${id}`);
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
          <TokenValue amount={data().amount} tokenAddress={savvaTokenAddress()} />
        </div>
      </div>
      <div class="text-sm">
        <span class="text-[hsl(var(--muted-foreground))]">
          {t("alerts.fundraiser_contribution.actionText")}
        </span>
        <a
          href={`#/fr/${campaignId()}`}
          onClick={handleCampaignClick}
          class="font-semibold text-[hsl(var(--foreground))] hover:underline ml-1"
        >
          {creator().name || t("default.user")}'s campaign
        </a>
      </div>
    </div>
  );
}