// src/x/promote/PromoteNftTab.jsx
import { useApp } from "../../context/AppContext.jsx";

export default function PromoteNftTab(props) {
  const app = useApp();
  const { t } = app;

  return (
    <div class="bg-[hsl(var(--background))] rounded-b-xl rounded-t-none border border-[hsl(var(--border))] border-t-0 p-6 -mt-px text-center">
      <span class="text-sm opacity-80">{t("promote.nft.comingSoon")}</span>
    </div>
  );
}
