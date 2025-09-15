// src/x/editor/ClaimableRewardHint.jsx
// path: src/x/editor/ClaimableRewardHint.jsx
import { Show, createMemo, createResource, createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { walletAccount } from "../../blockchain/wallet.js";
import InfoIcon from "../ui/icons/InfoIcon.jsx";

export default function ClaimableRewardHint() {
  const app = useApp();
  const { t } = app;

  const domain = () => app.selectedDomainName?.() || "";
  const author = () => app.actorAddress?.() || app.authorizedUser?.()?.address || walletAccount() || "";
  const [visEpoch, setVisEpoch] = createSignal(0);

  const [claimable, { refetch }] = createResource(
    () => [domain(), author(), app.desiredChainId?.(), visEpoch()],
    async ([d, a]) => {
      if (!d || !a) return 0n;
      try {
        const clubs = await getSavvaContract(app, "AuthorsClubs");
        const v = await clubs.read.claimableGain([d, a]);
        return typeof v === "bigint" ? v : BigInt(v || 0);
      } catch {
        return 0n;
      }
    }
  );

  onMount(() => {
    const onVis = () => { if (!document.hidden) setVisEpoch((n) => n + 1); };
    const onKick = () => refetch(); // keep the hint in sync too
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("savva:claimable-refresh", onKick);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("savva:claimable-refresh", onKick);
    });
  });

  const hasReward = createMemo(() => (claimable() || 0n) > 0n);

  return (
    <Show when={hasReward()}>
      <div
        role="note"
        class="inline-flex items-center gap-3 px-4 py-2 rounded-xl cursor-default select-none
               text-[hsl(var(--background))]"
        style={{ background: "var(--gradient)" }}
      >
        <InfoIcon class="w-5 h-5 opacity-90 flex-shrink-0" />
        <span class="text-sm">{t("editor.publishNowGet")}</span>
        <span class="h-4 w-px bg-[hsl(var(--background))]/30" aria-hidden="true"></span>
        <div class="text-sm">
          <TokenValue amount={claimable()} />
        </div>
      </div>
    </Show>
  );
}
