// src/x/main/NewPostButton.jsx
// path: src/x/main/NewPostButton.jsx
import { Show, createSignal, createResource, onMount, onCleanup, createMemo } from "solid-js";
import { navigate } from "../../routing/hashRouter.js";
import { useApp } from "../../context/AppContext.jsx";
import { EditIcon as NewPostIcon } from "../ui/icons/ActionIcons.jsx";
import SavvaTokenIcon from "../ui/icons/SavvaTokenIcon.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { walletAccount } from "../../blockchain/wallet.js";
import { formatUnits } from "viem";

export default function NewPostButton() {
  const app = useApp();
  const { t } = app;

  const domain = () => app.selectedDomainName?.() || "";
  const actorAddr = () => app.actorAddress?.() || app.authorizedUser?.()?.address || walletAccount() || "";
  const [visEpoch, setVisEpoch] = createSignal(0);

  const [claimable, { refetch }] = createResource(
    () => ({ domain: domain(), author: actorAddr(), epoch: visEpoch(), chain: app.desiredChainId?.() }),
    async ({ domain, author }) => {
      if (!domain || !author) return 0n;
      try {
        const clubs = await getSavvaContract(app, "AuthorsClubs");
        const v = await clubs.read.claimableGain([domain, author]);
        return typeof v === "bigint" ? v : BigInt(v || 0);
      } catch {
        return 0n;
      }
    }
  );

  onMount(() => {
    const onVis = () => { if (!document.hidden) setVisEpoch((n) => n + 1); };
    const onKick = () => refetch(); // refresh badge on demand
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("savva:claimable-refresh", onKick);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("savva:claimable-refresh", onKick);
    });
  });

  const hasReward = createMemo(() => (claimable() || 0n) > 0n);
  const tooltip = createMemo(() => {
    const amt = claimable();
    if (typeof amt !== "bigint" || amt <= 0n) return t("header.newPost");
    try { return `${t("wallet.menu.claim")}: ${formatUnits(amt, 18)} SAVVA`; } catch { return t("wallet.menu.claim"); }
  });

  const handleNewPost = () => {
    app.setSavedScrollY?.(window.scrollY);
    navigate("/editor/new");
  };

  return (
    <div class="relative">
      <button
        class="p-1.5 rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
        onClick={handleNewPost}
        title={tooltip()}
        aria-label={t("header.newPost")}
      >
        <NewPostIcon class="w-5 h-5" />
      </button>

      <Show when={hasReward()}>
        <span
          class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center shadow"
        >
          <SavvaTokenIcon class="w-3 h-3" />
        </span>
      </Show>
    </div>
  );
}
