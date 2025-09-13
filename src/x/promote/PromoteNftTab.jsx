// src/x/promote/PromoteNftTab.jsx
import { useApp } from "../../context/AppContext.jsx";

export default function PromoteNftTab(props) {
  const app = useApp();
  const { t } = app;
  const post = () => props.post || null;

  return (
    <div class="space-y-3">
      <div class="text-sm opacity-80">{t("promote.nft.placeholder")}</div>
      {/* Later: NFT mint/sell options, price, supply, royalties */}
      <div class="rounded-lg border border-[hsl(var(--border))] p-3 text-xs opacity-70">
        {t("promote.postId")}: {post()?.savva_cid || post()?.id || ""}
      </div>
    </div>
  );
}
