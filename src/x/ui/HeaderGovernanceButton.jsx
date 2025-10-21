// src/x/ui/HeaderGovernanceButton.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/smartRouter.js";
import { VoteIcon } from "./icons/GeneralIcons.jsx";

export default function HeaderGovernanceButton() {
  const app = useApp();
  const { t } = app;

  const count = () => {
    const val = app.activeProposalsCount?.() || 0;
    console.log("[HeaderGovernanceButton] count:", val);
    return val;
  };

  console.log("[HeaderGovernanceButton] Rendering, count:", count());

  return (
    <Show when={count() > 0}>
      <button
        type="button"
        class="relative p-1.5 rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
        aria-label={t("governance.activeProposals")}
        title={t("governance.activeProposals")}
        onClick={() => navigate("/governance")}
      >
        <VoteIcon class="w-5 h-5" />

        {/* Badge with count */}
        <Show when={count() > 0}>
          <span class="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full border-2 border-[hsl(var(--background))]">
            {count() > 99 ? "99+" : count()}
          </span>
        </Show>
      </button>
    </Show>
  );
}
